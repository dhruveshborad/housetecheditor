import { localDb } from '../dexie/db';
import { useEditorStore, registerSyncTrigger } from '../store/editor-store';

class BackgroundSyncEngine {
  private isSyncing = false;
  private backoffDelay = 1000; // Start with 1 second backoff
  private maxBackoff = 60000;  // Max 60 seconds
  private syncTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window === 'undefined') return;

    // Listen to network status change events
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));

    // Register this engine's trigger method with the store
    registerSyncTrigger(() => this.triggerSync());
  }

  /**
   * Starts the sync engine and begins periodic sync heartbeats.
   */
  public start() {
    if (typeof window === 'undefined') return;

    console.log('Background Sync Engine started.');
    this.triggerSync();

    // Start periodic pull heartbeat (every 10 seconds to fetch changes from other users)
    this.heartbeatInterval = setInterval(() => {
      this.pullLatestOperations();
    }, 10000);
  }

  /**
   * Stops the sync engine and clears timeouts.
   */
  public stop() {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  private handleNetworkChange(isOnline: boolean) {
    console.log(`Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    useEditorStore.getState().setNetworkStatus(isOnline ? 'online' : 'offline');
    
    if (isOnline) {
      this.backoffDelay = 1000; // Reset backoff on reconnect
      this.triggerSync();
    }
  }

  /**
   * Triggers an immediate sync loop sweep.
   */
  public triggerSync() {
    if (this.isSyncing) return;
    if (useEditorStore.getState().networkStatus === 'offline') {
      useEditorStore.getState().updateSyncStats();
      return;
    }

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    this.runSyncSweep();
  }

  /**
   * Core sync loop that batches pending operations and pushes them.
   */
  private async runSyncSweep() {
    if (!localDb) return;
    this.isSyncing = true;
    useEditorStore.getState().setSyncStatus('syncing');
    useEditorStore.getState().updateSyncStats();

    try {
      // 1. Fetch pending items from queue
      const pendingItems = await localDb.syncQueue
        .where('status')
        .anyOf(['PENDING', 'FAILED'])
        .limit(100) // Batch size limit
        .toArray();

      if (pendingItems.length === 0) {
        this.isSyncing = false;
        useEditorStore.getState().setSyncStatus('idle');
        useEditorStore.getState().updateSyncStats();
        return; // Nothing to sync
      }

      // Mark items as SYNCING in Dexie
      const queueIds = pendingItems.map(item => item.id!);
      await localDb.syncQueue
        .where('id')
        .anyOf(queueIds)
        .modify({ status: 'SYNCING', lastAttempt: Date.now() });

      useEditorStore.getState().updateSyncStats();

      // 2. Fetch the actual operation payloads
      const operationIds = pendingItems.map(item => item.operationId);
      const operations = await localDb.operations
        .where('operationId')
        .anyOf(operationIds)
        .toArray();

      // Sort operations relative to queue insertion order to preserve causal dependency
      const opIdOrder = new Map(operationIds.map((id, index) => [id, index]));
      operations.sort((a, b) => (opIdOrder.get(a.operationId) ?? 0) - (opIdOrder.get(b.operationId) ?? 0));

      // 3. Post operations to the server
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && Array.isArray(result.syncedIds)) {
        const syncedIdsSet = new Set<string>(result.syncedIds);

        // Remove successfully synced operations from queue and update their isSynced status
        await localDb.transaction('rw', [localDb.syncQueue, localDb.operations], async () => {
          await localDb.syncQueue
            .where('operationId')
            .anyOf(result.syncedIds)
            .delete();

          await localDb.operations
            .where('operationId')
            .anyOf(result.syncedIds)
            .modify({ isSynced: 1 });
        });

        // Mark failed sync operations back to FAILED
        const unsyncedQueueIds = pendingItems
          .filter(item => !syncedIdsSet.has(item.operationId))
          .map(item => item.id!);

        if (unsyncedQueueIds.length > 0) {
          await localDb.syncQueue
            .where('id')
            .anyOf(unsyncedQueueIds)
            .modify(item => {
              item.status = 'FAILED';
              item.retryCount += 1;
              item.error = 'Rejected by server';
            });
        }

        // Apply any remote operations returned by the server
        if (result.newOperations && result.newOperations.length > 0) {
          await useEditorStore.getState().applyRemoteOperations(result.newOperations);
        }

        // Reset backoff delay and check if there are more pending items
        this.backoffDelay = 1000;
        this.isSyncing = false;
        useEditorStore.getState().setSyncStatus('idle');
        
        // Loop again immediately if there was work done
        this.triggerSync();
      } else {
        throw new Error('Malformed server response');
      }
    } catch (error) {
      const err = error as Error;
      console.error('Background sync failed:', err);
      
      // Update items in queue to FAILED status
      if (localDb) {
        const syncingItems = await localDb.syncQueue
          .where('status')
          .equals('SYNCING')
          .toArray();

        const syncingIds = syncingItems.map(item => item.id!);
        if (syncingIds.length > 0) {
          await localDb.syncQueue
            .where('id')
            .anyOf(syncingIds)
            .modify(item => {
              item.status = 'FAILED';
              item.retryCount += 1;
              item.error = err.message || 'Network error';
            });
        }
      }

      this.isSyncing = false;
      useEditorStore.getState().setSyncStatus('failed');
      useEditorStore.getState().updateSyncStats();

      // Schedule retry with exponential backoff
      this.backoffDelay = Math.min(this.backoffDelay * 2, this.maxBackoff);
      console.log(`Scheduling sync retry in ${this.backoffDelay}ms`);
      this.syncTimeout = setTimeout(() => this.triggerSync(), this.backoffDelay);
    }
  }

  /**
   * Heartbeat pull to retrieve operations created by other clients.
   */
  private async pullLatestOperations() {
    const { currentDocument, networkStatus } = useEditorStore.getState();
    if (!currentDocument || !localDb || networkStatus === 'offline' || this.isSyncing) return;

    try {
      // Find the highest Lamport timestamp we have for the current document
      const lastOp = await localDb.operations
        .where('documentId')
        .equals(currentDocument.id)
        .reverse()
        .sortBy('lamportTimestamp');

      const maxLocalTimestamp = lastOp.length > 0 ? lastOp[0].lamportTimestamp : 0;

      const response = await fetch(
        `/api/sync?documentId=${currentDocument.id}&lastTimestamp=${maxLocalTimestamp}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.newOperations) && data.newOperations.length > 0) {
          console.log(`Fetched ${data.newOperations.length} new operations from server.`);
          await useEditorStore.getState().applyRemoteOperations(data.newOperations);
        }
      }
    } catch (e) {
      console.warn('Failed to pull latest operations from server:', e);
    }
  }
}

// Singleton background sync instance
export const syncEngine = new BackgroundSyncEngine();

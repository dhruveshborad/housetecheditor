import { create } from 'zustand';
import { localDb, type LocalDocument, type LocalOperation } from '../dexie/db';
import { mergeOperations, type Block } from '../conflict/merge';
import { socketClient } from '../socket/socket-client';

// Helper to generate UUIDs locally
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface Collaborator {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  color: string;
  typing: boolean;
}

interface EditorState {
  clientId: string;
  lamportTimestamp: number;
  currentDocument: LocalDocument | null;
  blocks: Block[];
  networkStatus: 'online' | 'offline';
  syncStatus: 'idle' | 'syncing' | 'failed';
  pendingOpsCount: number;
  failedOpsCount: number;
  lastSyncTime: number | null;
  activeCollaborators: Collaborator[];
  accessDenied: boolean;

  // Actions
  initialize: () => Promise<void>;
  setNetworkStatus: (status: 'online' | 'offline') => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'failed') => void;
  loadDocument: (docId: string) => Promise<void>;
  unloadDocument: () => void;
  editTitle: (title: string) => Promise<void>;
  insertBlock: (blockId: string, type: string, content: string, prevId: string | null, attrs?: Record<string, any>) => Promise<void>;
  updateBlock: (blockId: string, type: string, content: string, attrs?: Record<string, any>) => Promise<void>;
  deleteBlock: (blockId: string) => Promise<void>;
  moveBlock: (blockId: string, prevId: string | null) => Promise<void>;
  createVersion: (authorId: string, changeSummary: string) => Promise<string>;

  // Sync / Real-time support
  updateSyncStats: () => Promise<void>;
  applyRemoteOperations: (ops: LocalOperation[]) => Promise<void>;
  setCollaborators: (collaborators: Collaborator[]) => void;
  triggerSync: () => void;
}

// Global reference to background sync engine to trigger it
let globalSyncTrigger: (() => void) | null = null;
export function registerSyncTrigger(trigger: () => void) {
  globalSyncTrigger = trigger;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  clientId: '',
  lamportTimestamp: 0,
  currentDocument: null,
  blocks: [],
  networkStatus: 'online',
  syncStatus: 'idle',
  pendingOpsCount: 0,
  failedOpsCount: 0,
  lastSyncTime: null,
  activeCollaborators: [],
  accessDenied: false,

  initialize: async () => {
    if (typeof window === 'undefined') return;

    // Get or create unique clientId for this browser instance
    let clientId = localStorage.getItem('houseeditor_client_id');
    if (!clientId) {
      clientId = generateUUID();
      localStorage.setItem('houseeditor_client_id', clientId);
    }

    // Get initial network status
    const networkStatus = navigator.onLine ? 'online' : 'offline';

    // Find maximum local Lamport timestamp from existing operations
    let maxTimestamp = 0;
    if (localDb) {
      const lastOp = await localDb.operations
        .orderBy('[documentId+lamportTimestamp+clientId]')
        .last();
      if (lastOp) {
        maxTimestamp = lastOp.lamportTimestamp;
      }
    }

    set({
      clientId,
      networkStatus,
      lamportTimestamp: maxTimestamp,
    });

    // Update initial sync counts
    await get().updateSyncStats();
  },

  setNetworkStatus: (status) => {
    set({ networkStatus: status });
    if (status === 'online' && globalSyncTrigger) {
      globalSyncTrigger();
    }
  },

  setSyncStatus: (status) => {
    set({ syncStatus: status });
  },

  loadDocument: async (docId) => {
    if (!localDb) return;

    // Reset access denied on new load
    set({ accessDenied: false });

    // 1. Try fetching from local IndexedDB first (local-first principle)
    let doc = await localDb.documents.get(docId);

    if (!doc) {
      // 2. Document not in IndexedDB — try fetching from server (first load)
      try {
        const res = await fetch(`/api/documents/${docId}`);
        if (res.ok) {
          const data = await res.json();
          const serverDoc = data.document;

          // Seed IndexedDB from server document
          doc = {
            id: serverDoc.id,
            title: serverDoc.title,
            content: serverDoc.content || '[]',
            workspaceId: serverDoc.workspaceId,
            createdBy: serverDoc.createdBy,
            version: serverDoc.version || 1,
            createdAt: new Date(serverDoc.createdAt).getTime(),
            updatedAt: new Date(serverDoc.updatedAt).getTime(),
            isDirty: false,
            userRole: serverDoc.userRole,
          };
          await localDb.documents.put(doc);

          // Also seed member info locally
          if (serverDoc.members) {
            for (const m of serverDoc.members) {
              await localDb.members.put({
                id: m.id,
                documentId: serverDoc.id,
                userId: m.userId,
                role: m.role,
              }).catch(() => { }); // Ignore duplicates
            }
          }
        } else if (res.status === 403 || res.status === 401) {
          // No access — mark as denied and abort
          set({ accessDenied: true });
          return;
        } else if (res.status === 404) {
          set({ accessDenied: true }); // Can also act as "Not Found" protection
          return;
        }
      } catch (e) {
        // Network unavailable — create a minimal offline stub
        console.warn('Could not fetch document from server, creating offline stub:', e);
      }

      if (!doc && !get().accessDenied) {
        // Create empty offline stub as last resort
        doc = {
          id: docId,
          title: 'Untitled Document',
          content: '[]',
          workspaceId: 'default',
          createdBy: 'system',
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDirty: true,
        };
        await localDb.documents.put(doc);
      }
    }

    // Double-check if we were denied access while offline (if doc exists but user shouldn't see it? 
    // Usually local DB is cleared on logout so this is fine.)
    if (get().accessDenied) return;

    // 3. Fetch all local operations for this document
    const ops = await localDb.operations
      .where('documentId')
      .equals(docId)
      .toArray();

    // 4. Reconstruct document state using CRDT merge
    const { blocks, title } = mergeOperations(
      doc!.title,
      JSON.parse(doc!.content || '[]'),
      ops
    );

    set({
      currentDocument: { ...doc!, title, content: JSON.stringify(blocks) },
      blocks,
      activeCollaborators: [],
    });

    await get().updateSyncStats();

    if (typeof window !== 'undefined' && navigator.onLine) {
      fetch(`/api/documents/${docId}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            const serverDoc = data.document;

            const existingLocalDoc = await localDb.documents.get(docId);
            if (existingLocalDoc) {
              const updatedDoc = {
                ...existingLocalDoc,
                userRole: serverDoc.userRole,
                title: existingLocalDoc.isDirty ? existingLocalDoc.title : serverDoc.title,
                workspaceId: serverDoc.workspaceId,
                createdBy: serverDoc.createdBy,
              };
              await localDb.documents.put(updatedDoc);

              const currentDocState = get().currentDocument;
              if (currentDocState && currentDocState.id === docId) {
                set({
                  currentDocument: {
                    ...currentDocState,
                    userRole: serverDoc.userRole,
                    title: existingLocalDoc.isDirty ? currentDocState.title : serverDoc.title,
                  }
                });
              }
            }
          } else if (res.status === 403 || res.status === 401 || res.status === 404) {
            set({ accessDenied: true });
          }
        })
        .catch((err) => {
          console.warn('Failed to update document metadata from server in background:', err);
        });
    }
  },

  unloadDocument: () => {
    set({ currentDocument: null, blocks: [], activeCollaborators: [], accessDenied: false });
  },

  editTitle: async (title) => {
    const { currentDocument, clientId, lamportTimestamp } = get();
    if (!currentDocument || !localDb) return;
    if (currentDocument.userRole === 'VIEWER') return;

    const nextTimestamp = lamportTimestamp + 1;
    const opId = generateUUID();
    const opTime = Date.now();

    const op: LocalOperation = {
      operationId: opId,
      documentId: currentDocument.id,
      clientId,
      lamportTimestamp: nextTimestamp,
      operationType: 'SET_TITLE',
      payload: JSON.stringify({ title }),
      createdAt: opTime,
      isSynced: 0,
    };

    // Store operation and queue for sync
    await localDb.operations.add(op);
    await localDb.syncQueue.add({
      operationId: opId,
      documentId: currentDocument.id,
      status: 'PENDING',
      retryCount: 0,
    });

    // Optimistic Update
    const updatedDoc = {
      ...currentDocument,
      title,
      updatedAt: opTime,
    };
    await localDb.documents.put(updatedDoc);

    set({
      currentDocument: updatedDoc,
      lamportTimestamp: nextTimestamp,
    });

    await get().updateSyncStats();
    socketClient.broadcastOperations([op]);
    get().triggerSync();
  },

  insertBlock: async (blockId, type, content, prevId, attrs) => {
    const { currentDocument, clientId, lamportTimestamp, blocks } = get();
    if (!currentDocument || !localDb) return;
    if (currentDocument.userRole === 'VIEWER') return;

    const nextTimestamp = lamportTimestamp + 1;
    const opId = generateUUID();
    const opTime = Date.now();

    const op: LocalOperation = {
      operationId: opId,
      documentId: currentDocument.id,
      clientId,
      lamportTimestamp: nextTimestamp,
      operationType: 'INSERT_BLOCK',
      payload: JSON.stringify({ blockId, type, content, prevId, attrs }),
      createdAt: opTime,
      isSynced: 0,
    };

    await localDb.operations.add(op);
    await localDb.syncQueue.add({
      operationId: opId,
      documentId: currentDocument.id,
      status: 'PENDING',
      retryCount: 0,
    });

    // Optimistic Merge
    const allOps = await localDb.operations
      .where('documentId')
      .equals(currentDocument.id)
      .toArray();

    const initialBlocks = JSON.parse(currentDocument.content || '[]');
    const mergeResult = mergeOperations(currentDocument.title, initialBlocks, allOps);

    const updatedDoc = {
      ...currentDocument,
      content: JSON.stringify(mergeResult.blocks),
      updatedAt: opTime,
    };
    await localDb.documents.put(updatedDoc);

    set({
      currentDocument: updatedDoc,
      blocks: mergeResult.blocks,
      lamportTimestamp: nextTimestamp,
    });

    await get().updateSyncStats();
    socketClient.broadcastOperations([op]);
    get().triggerSync();
  },

  updateBlock: async (blockId, type, content, attrs) => {
    const { currentDocument, clientId, lamportTimestamp } = get();
    if (!currentDocument || !localDb) return;
    if (currentDocument.userRole === 'VIEWER') return;

    const nextTimestamp = lamportTimestamp + 1;
    const opId = generateUUID();
    const opTime = Date.now();

    const op: LocalOperation = {
      operationId: opId,
      documentId: currentDocument.id,
      clientId,
      lamportTimestamp: nextTimestamp,
      operationType: 'UPDATE_BLOCK',
      payload: JSON.stringify({ blockId, type, content, attrs }),
      createdAt: opTime,
      isSynced: 0,
    };

    await localDb.operations.add(op);
    await localDb.syncQueue.add({
      operationId: opId,
      documentId: currentDocument.id,
      status: 'PENDING',
      retryCount: 0,
    });

    // Optimistic Merge
    const allOps = await localDb.operations
      .where('documentId')
      .equals(currentDocument.id)
      .toArray();

    const initialBlocks = JSON.parse(currentDocument.content || '[]');
    const mergeResult = mergeOperations(currentDocument.title, initialBlocks, allOps);

    const updatedDoc = {
      ...currentDocument,
      content: JSON.stringify(mergeResult.blocks),
      updatedAt: opTime,
    };
    await localDb.documents.put(updatedDoc);

    set({
      currentDocument: updatedDoc,
      blocks: mergeResult.blocks,
      lamportTimestamp: nextTimestamp,
    });

    await get().updateSyncStats();
    socketClient.broadcastOperations([op]);
    get().triggerSync();
  },

  deleteBlock: async (blockId) => {
    const { currentDocument, clientId, lamportTimestamp } = get();
    if (!currentDocument || !localDb) return;
    if (currentDocument.userRole === 'VIEWER') return;

    const nextTimestamp = lamportTimestamp + 1;
    const opId = generateUUID();
    const opTime = Date.now();

    const op: LocalOperation = {
      operationId: opId,
      documentId: currentDocument.id,
      clientId,
      lamportTimestamp: nextTimestamp,
      operationType: 'DELETE_BLOCK',
      payload: JSON.stringify({ blockId }),
      createdAt: opTime,
      isSynced: 0,
    };

    await localDb.operations.add(op);
    await localDb.syncQueue.add({
      operationId: opId,
      documentId: currentDocument.id,
      status: 'PENDING',
      retryCount: 0,
    });

    // Optimistic Merge
    const allOps = await localDb.operations
      .where('documentId')
      .equals(currentDocument.id)
      .toArray();

    const initialBlocks = JSON.parse(currentDocument.content || '[]');
    const mergeResult = mergeOperations(currentDocument.title, initialBlocks, allOps);

    const updatedDoc = {
      ...currentDocument,
      content: JSON.stringify(mergeResult.blocks),
      updatedAt: opTime,
    };
    await localDb.documents.put(updatedDoc);

    set({
      currentDocument: updatedDoc,
      blocks: mergeResult.blocks,
      lamportTimestamp: nextTimestamp,
    });

    await get().updateSyncStats();
    socketClient.broadcastOperations([op]);
    get().triggerSync();
  },

  moveBlock: async (blockId, prevId) => {
    const { currentDocument, clientId, lamportTimestamp } = get();
    if (!currentDocument || !localDb) return;
    if (currentDocument.userRole === 'VIEWER') return;

    const nextTimestamp = lamportTimestamp + 1;
    const opId = generateUUID();
    const opTime = Date.now();

    const op: LocalOperation = {
      operationId: opId,
      documentId: currentDocument.id,
      clientId,
      lamportTimestamp: nextTimestamp,
      operationType: 'MOVE_BLOCK',
      payload: JSON.stringify({ blockId, prevId }),
      createdAt: opTime,
      isSynced: 0,
    };

    await localDb.operations.add(op);
    await localDb.syncQueue.add({
      operationId: opId,
      documentId: currentDocument.id,
      status: 'PENDING',
      retryCount: 0,
    });

    // Optimistic Merge
    const allOps = await localDb.operations
      .where('documentId')
      .equals(currentDocument.id)
      .toArray();

    const initialBlocks = JSON.parse(currentDocument.content || '[]');
    const mergeResult = mergeOperations(currentDocument.title, initialBlocks, allOps);

    const updatedDoc = {
      ...currentDocument,
      content: JSON.stringify(mergeResult.blocks),
      updatedAt: opTime,
    };
    await localDb.documents.put(updatedDoc);

    set({
      currentDocument: updatedDoc,
      blocks: mergeResult.blocks,
      lamportTimestamp: nextTimestamp,
    });

    await get().updateSyncStats();
    socketClient.broadcastOperations([op]);
    get().triggerSync();
  },

  createVersion: async (authorId, changeSummary) => {
    const { currentDocument, blocks } = get();
    if (!currentDocument || !localDb) throw new Error('No active document loaded');
    if (currentDocument.userRole === 'VIEWER') throw new Error('Viewers cannot create versions');

    const versionId = generateUUID();
    const time = Date.now();

    const localVer = {
      id: versionId,
      documentId: currentDocument.id,
      snapshot: JSON.stringify(blocks),
      authorId,
      createdAt: time,
      changeSummary,
    };

    // Save to local version table
    await localDb.versions.put(localVer);
    return versionId;
  },

  updateSyncStats: async () => {
    if (!localDb) return;

    const pending = await localDb.syncQueue
      .where('status')
      .equals('PENDING')
      .count();

    const failed = await localDb.syncQueue
      .where('status')
      .equals('FAILED')
      .count();

    const lastOp = await localDb.operations
      .where('isSynced')
      .equals(1)
      .reverse()
      .sortBy('createdAt');

    const lastSyncTime = lastOp.length > 0 ? lastOp[0].createdAt : null;

    set({
      pendingOpsCount: pending,
      failedOpsCount: failed,
      lastSyncTime,
    });
  },

  applyRemoteOperations: async (ops) => {
    const { currentDocument, lamportTimestamp } = get();
    if (!localDb) return;

    let updatedTimestamp = lamportTimestamp;

    // Apply each operation in a local transaction
    await localDb.transaction('rw', [localDb.operations, localDb.documents], async () => {
      for (const op of ops) {
        // Idempotency check: see if operation already exists
        const exists = await localDb.operations
          .where('operationId')
          .equals(op.operationId)
          .first();

        if (!exists) {
          // Store with isSynced = 1 (since it came from server)
          await localDb.operations.add({
            ...op,
            isSynced: 1,
          });

          // Sync local clock
          updatedTimestamp = Math.max(updatedTimestamp, op.lamportTimestamp) + 1;
        }
      }

      // If there's an active document, recalculate its merged state
      if (currentDocument) {
        const allOps = await localDb.operations
          .where('documentId')
          .equals(currentDocument.id)
          .toArray();

        // Standard seed document
        const initialDoc = await localDb.documents.get(currentDocument.id);
        const seedBlocks = JSON.parse(initialDoc?.content || '[]');
        const seedTitle = initialDoc?.title || 'Untitled Document';

        const mergeResult = mergeOperations(seedTitle, seedBlocks, allOps);

        const updatedDoc: LocalDocument = {
          ...(initialDoc || currentDocument),
          title: mergeResult.title,
          content: JSON.stringify(mergeResult.blocks),
          updatedAt: Date.now(),
        };

        await localDb.documents.put(updatedDoc);

        // Update active store state
        set({
          currentDocument: updatedDoc,
          blocks: mergeResult.blocks,
          lamportTimestamp: updatedTimestamp,
        });
      } else {
        set({ lamportTimestamp: updatedTimestamp });
      }
    });

    await get().updateSyncStats();
  },

  setCollaborators: (collaborators) => {
    set({ activeCollaborators: collaborators });
  },

  triggerSync: () => {
    if (globalSyncTrigger) {
      globalSyncTrigger();
    }
  },
}));

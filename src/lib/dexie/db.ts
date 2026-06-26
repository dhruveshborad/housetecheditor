import Dexie, { type Table } from 'dexie';

export interface LocalDocument {
  id: string;
  title: string;
  content: string; // JSON string representing the blocks
  workspaceId: string;
  createdBy: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  isDirty?: boolean;
  userRole?: 'OWNER' | 'EDITOR' | 'VIEWER';
}

export interface LocalVersion {
  id: string;
  documentId: string;
  snapshot: string; // JSON string snapshot of blocks
  authorId: string;
  createdAt: number;
  changeSummary: string;
}

export interface LocalOperation {
  id?: number; // Auto-incrementing local ID
  operationId: string; // Unique UUID
  documentId: string;
  clientId: string;
  lamportTimestamp: number;
  operationType: 'INSERT_BLOCK' | 'UPDATE_BLOCK' | 'DELETE_BLOCK' | 'MOVE_BLOCK' | 'SET_TITLE';
  payload: string; // stringified JSON of operation payload details
  createdAt: number;
  isSynced: number; // 0 = false, 1 = true
}

export interface LocalSyncQueue {
  id?: number;
  operationId: string;
  documentId: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'COMPLETED';
  retryCount: number;
  lastAttempt?: number;
  error?: string;
}

export interface LocalMember {
  id: string;
  documentId: string;
  userId: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
}

class HouseEditorDatabase extends Dexie {
  documents!: Table<LocalDocument, string>;
  versions!: Table<LocalVersion, string>;
  operations!: Table<LocalOperation, number>;
  syncQueue!: Table<LocalSyncQueue, number>;
  members!: Table<LocalMember, string>;

  constructor() {
    super('HouseEditorDB');
    this.version(1).stores({
      documents: 'id, workspaceId, updatedAt',
      versions: 'id, documentId, createdAt',
      operations: '++id, operationId, documentId, [documentId+lamportTimestamp+clientId], isSynced',
      syncQueue: '++id, operationId, documentId, status',
      members: 'id, [documentId+userId], userId',
    });
  }
}

// Ensure database instance is only created on client side (browser)
export const localDb = typeof window !== 'undefined' 
  ? new HouseEditorDatabase() 
  : null as unknown as HouseEditorDatabase;

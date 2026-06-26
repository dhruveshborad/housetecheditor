import { describe, it, expect } from 'vitest';
import { mergeOperations, type Block } from '../src/lib/conflict/merge';
import type { LocalOperation } from '../src/lib/dexie/db';

describe('Deterministic Conflict Resolution (Lamport Merge)', () => {
  const initialTitle = 'Untitled Document';
  const initialBlocks: Block[] = [];

  it('should set the title of the document', () => {
    const ops: LocalOperation[] = [
      {
        operationId: 'op-1',
        documentId: 'doc-1',
        clientId: 'client-A',
        lamportTimestamp: 1,
        operationType: 'SET_TITLE',
        payload: JSON.stringify({ title: 'New Document Title' }),
        createdAt: Date.now(),
        isSynced: 0,
      },
    ];

    const result = mergeOperations(initialTitle, initialBlocks, ops);
    expect(result.title).toBe('New Document Title');
    expect(result.blocks).toEqual([]);
  });

  it('should insert blocks in sequential order', () => {
    const ops: LocalOperation[] = [
      {
        operationId: 'op-1',
        documentId: 'doc-1',
        clientId: 'client-A',
        lamportTimestamp: 1,
        operationType: 'INSERT_BLOCK',
        payload: JSON.stringify({ blockId: 'b1', type: 'paragraph', content: 'First block', prevId: null }),
        createdAt: Date.now(),
        isSynced: 0,
      },
      {
        operationId: 'op-2',
        documentId: 'doc-1',
        clientId: 'client-A',
        lamportTimestamp: 2,
        operationType: 'INSERT_BLOCK',
        payload: JSON.stringify({ blockId: 'b2', type: 'paragraph', content: 'Second block', prevId: 'b1' }),
        createdAt: Date.now(),
        isSynced: 0,
      },
    ];

    const result = mergeOperations(initialTitle, initialBlocks, ops);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].id).toBe('b1');
    expect(result.blocks[1].id).toBe('b2');
    expect(result.blocks[1].prevId).toBe('b1');
  });

  it('should resolve concurrent inserts at the same position deterministically', () => {
    // Client A inserts "bA" after null at Lamport 1
    // Client B inserts "bB" after null at Lamport 1
    // Since Lamport timestamps are equal (1), it should tie-break on clientId: "client-A" < "client-B"
    // So "client-A"'s op comes first, then "client-B"'s op.
    // Result should place bB after bA, or order them deterministically.
    const ops: LocalOperation[] = [
      {
        operationId: 'op-A',
        documentId: 'doc-1',
        clientId: 'client-A',
        lamportTimestamp: 1,
        operationType: 'INSERT_BLOCK',
        payload: JSON.stringify({ blockId: 'bA', type: 'paragraph', content: 'From A', prevId: null }),
        createdAt: Date.now(),
        isSynced: 0,
      },
      {
        operationId: 'op-B',
        documentId: 'doc-1',
        clientId: 'client-B',
        lamportTimestamp: 1,
        operationType: 'INSERT_BLOCK',
        payload: JSON.stringify({ blockId: 'bB', type: 'paragraph', content: 'From B', prevId: null }),
        createdAt: Date.now(),
        isSynced: 0,
      },
    ];

    // Both clients must merge and produce the EXACT same order
    const merge1 = mergeOperations(initialTitle, initialBlocks, ops);
    const merge2 = mergeOperations(initialTitle, initialBlocks, [...ops].reverse()); // reverse input order to test determinism

    expect(merge1.blocks).toEqual(merge2.blocks);
    expect(merge1.blocks[0].id).toBe('bA');
    expect(merge1.blocks[1].id).toBe('bB');
  });

  it('should process block deletions using tombstones', () => {
    const ops: LocalOperation[] = [
      {
        operationId: 'op-1',
        documentId: 'doc-1',
        clientId: 'client-A',
        lamportTimestamp: 1,
        operationType: 'INSERT_BLOCK',
        payload: JSON.stringify({ blockId: 'b1', type: 'paragraph', content: 'Hello', prevId: null }),
        createdAt: Date.now(),
        isSynced: 0,
      },
      {
        operationId: 'op-2',
        documentId: 'doc-1',
        clientId: 'client-A',
        lamportTimestamp: 2,
        operationType: 'DELETE_BLOCK',
        payload: JSON.stringify({ blockId: 'b1' }),
        createdAt: Date.now(),
        isSynced: 0,
      },
    ];

    const result = mergeOperations(initialTitle, initialBlocks, ops);
    expect(result.blocks).toHaveLength(0); // b1 is deleted
  });

  it('should prevent cyclic moves', () => {
    // Initial blocks: b1 -> b2
    const seedBlocks: Block[] = [
      { id: 'b1', type: 'paragraph', content: 'B1', prevId: null },
      { id: 'b2', type: 'paragraph', content: 'B2', prevId: 'b1' },
    ];

    // Move b1 to be after b2 (creates a prospective cycle: b2 -> b1 -> b2)
    const ops: LocalOperation[] = [
      {
        operationId: 'op-move',
        documentId: 'doc-1',
        clientId: 'client-A',
        lamportTimestamp: 1,
        operationType: 'MOVE_BLOCK',
        payload: JSON.stringify({ blockId: 'b1', prevId: 'b2' }),
        createdAt: Date.now(),
        isSynced: 0,
      },
    ];

    const result = mergeOperations(initialTitle, seedBlocks, ops);
    // Cycle check should reject the move and keep the original structure
    expect(result.blocks[0].id).toBe('b1');
    expect(result.blocks[1].id).toBe('b2');
  });
});

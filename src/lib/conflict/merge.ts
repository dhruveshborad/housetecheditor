import type { LocalOperation } from '../dexie/db';

export interface Block {
  id: string;
  type: string;
  content: string;
  prevId: string | null;
  deleted?: boolean;
  lamportTimestamp?: number;
  clientId?: string;
  attrs?: Record<string, unknown>;
}

export interface OperationPayload {
  title?: string;
  blockId?: string;
  type?: string;
  content?: string;
  prevId?: string | null;
  attrs?: Record<string, unknown>;
}

export interface MergeResult {
  blocks: Block[];
  title: string;
}

/**
 * Deterministically merges an array of operations into a final document state.
 * 
 * Algorithm:
 * 1. Sort all operations by lamportTimestamp (ascending), then clientId (lexicographically ascending).
 * 2. Process operations sequentially to construct a map of blocks.
 * 3. Construct a parent-child tree (where child.prevId points to parent).
 * 4. Sort siblings sharing the same prevId by their operation timestamp and client ID.
 * 5. Reconstruct the document by performing a depth-first traversal (DFS) starting from null (root).
 * 6. Filter out deleted blocks (tombstones).
 */
export function mergeOperations(
  initialTitle: string,
  initialBlocks: Block[],
  operations: LocalOperation[]
): MergeResult {
  // Sort operations by lamportTimestamp (ascending), then clientId (lexicographically ascending)
  const sortedOps = [...operations].sort((a, b) => {
    if (a.lamportTimestamp !== b.lamportTimestamp) {
      return a.lamportTimestamp - b.lamportTimestamp;
    }
    return a.clientId.localeCompare(b.clientId);
  });

  // Map to hold the state of blocks
  const blocksMap = new Map<string, Block>();

  // Seed the map with initial blocks
  for (const block of initialBlocks) {
    blocksMap.set(block.id, { ...block, deleted: false });
  }

  let title = initialTitle;

  // Apply operations sequentially
  for (const op of sortedOps) {
    let payload: OperationPayload | null = null;
    try {
      payload = typeof op.payload === 'string' ? JSON.parse(op.payload) : (op.payload as OperationPayload);
    } catch (e) {
      console.error('Failed to parse operation payload:', op, e);
      continue;
    }

    switch (op.operationType) {
      case 'SET_TITLE':
        if (payload && typeof payload.title === 'string') {
          title = payload.title;
        }
        break;

      case 'INSERT_BLOCK':
        if (payload && payload.blockId) {
          const newBlock: Block = {
            id: payload.blockId,
            type: payload.type || 'paragraph',
            content: payload.content || '',
            prevId: payload.prevId !== undefined ? payload.prevId : null,
            deleted: false,
            lamportTimestamp: op.lamportTimestamp,
            clientId: op.clientId,
            attrs: payload.attrs,
          };
          blocksMap.set(payload.blockId, newBlock);
        }
        break;

      case 'UPDATE_BLOCK':
        if (payload && payload.blockId) {
          const existing = blocksMap.get(payload.blockId);
          if (existing) {
            existing.content = payload.content !== undefined ? payload.content : existing.content;
            if (payload.attrs !== undefined) {
              existing.attrs = payload.attrs;
            }
          }
        }
        break;

      case 'DELETE_BLOCK':
        if (payload && payload.blockId) {
          const existing = blocksMap.get(payload.blockId);
          if (existing) {
            existing.deleted = true;
          }
        }
        break;

      case 'MOVE_BLOCK':
        if (payload && payload.blockId) {
          const existing = blocksMap.get(payload.blockId);
          if (existing) {
            // Check for cycles before moving
            const wouldCreateCycle = checkCycle(payload.blockId, payload.prevId, blocksMap);
            if (!wouldCreateCycle) {
              existing.prevId = payload.prevId !== undefined ? payload.prevId : null;
            }
          }
        }
        break;

      default:
        console.warn('Unknown operation type:', op.operationType);
    }
  }

  // Group blocks by their prevId to build adjacency lists
  const childrenMap = new Map<string | null, Block[]>();
  const allBlocks = Array.from(blocksMap.values());

  for (const block of allBlocks) {
    const parentId = block.prevId;
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(block);
  }

  // Sort children sharing the same prevId
  for (const children of childrenMap.values()) {
    children.sort((a, b) => {
      const aTime = a.lamportTimestamp || 0;
      const bTime = b.lamportTimestamp || 0;
      if (aTime !== bTime) {
        return aTime - bTime; // Ascending order of timestamp (older first, newer last)
      }
      const aClient = a.clientId || '';
      const bClient = b.clientId || '';
      return aClient.localeCompare(bClient); // Lexicographical tie-breaker
    });
  }

  const resultList: Block[] = [];
  const visited = new Set<string>();

  // DFS function to traverse from a given parent block
  function traverse(parentId: string | null) {
    const children = childrenMap.get(parentId);
    if (!children) return;

    for (const child of children) {
      if (visited.has(child.id)) {
        // Prevent infinite loops if cycles somehow formed
        continue;
      }
      visited.add(child.id);
      resultList.push(child);
      traverse(child.id);
    }
  }

  // Start traversing from root (prevId = null)
  traverse(null);

  // Fallback for unreachable blocks (e.g. cycles or orphaned blocks due to missing nodes)
  for (const block of allBlocks) {
    if (!visited.has(block.id)) {
      visited.add(block.id);
      resultList.push(block);
      traverse(block.id);
    }
  }

  // Filter out tombstones (deleted blocks) for the final rendering list
  const activeBlocks = resultList
    .filter(b => !b.deleted)
    .map(({ id, type, content, prevId }) => ({ id, type, content, prevId }));

  return {
    blocks: activeBlocks,
    title,
  };
}

/**
 * Checks if setting block's prevId to targetId would create a cycle.
 */
function checkCycle(blockId: string, targetId: string | null, blocksMap: Map<string, Block>): boolean {
  if (targetId === null) return false;
  if (blockId === targetId) return true;

  let currentId: string | null = targetId;
  const visited = new Set<string>([blockId]);

  while (currentId !== null) {
    if (visited.has(currentId)) {
      return true;
    }
    visited.add(currentId);
    const parentBlock = blocksMap.get(currentId);
    currentId = parentBlock ? parentBlock.prevId : null;
  }

  return false;
}

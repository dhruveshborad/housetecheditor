import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import type { Block } from '@/lib/conflict/merge';

interface RestoreOperation {
  operationId: string;
  documentId: string;
  clientId: string;
  lamportTimestamp: number;
  operationType: 'INSERT_BLOCK' | 'UPDATE_BLOCK' | 'DELETE_BLOCK' | 'MOVE_BLOCK' | 'SET_TITLE';
  payload: string;
}

const restoreSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
});

// Helper to generate UUIDs
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * POST /api/versions/restore
 * Restores a document to a previous version snapshot by creating new operations.
 * Enforces that only the OWNER can restore versions.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();

    const result = restoreSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: 'Invalid parameters', details: result.error.format() }, { status: 400 });
    }

    const { documentId, versionId } = result.data;

    // 1. Verify owner role (RBAC)
    const membership = await db.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId,
        },
      },
    });

    if (!membership || membership.role !== 'OWNER') {
      return Response.json({ error: 'Forbidden: Only the document OWNER can restore versions' }, { status: 403 });
    }

    // 2. Fetch the target version snapshot
    const targetVersion = await db.documentVersion.findUnique({
      where: { id: versionId },
    });

    if (!targetVersion || targetVersion.documentId !== documentId) {
      return Response.json({ error: 'Version not found' }, { status: 444 });
    }

    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return Response.json({ error: 'Document not found' }, { status: 444 });
    }

    const currentBlocks: Block[] = JSON.parse(document.content || '[]');
    const targetBlocks: Block[] = JSON.parse(targetVersion.snapshot || '[]');

    // 3. Find the highest Lamport timestamp in the database to append these restore operations after
    const lastOp = await db.documentOperation.findFirst({
      where: { documentId },
      orderBy: { lamportTimestamp: 'desc' },
    });
    let baseTimestamp = (lastOp?.lamportTimestamp || 0) + 1;

    const restoreOpsToCreate: RestoreOperation[] = [];
    const clientId = 'server-restore-client';

    const currentBlockMap = new Map<string, Block>(currentBlocks.map(b => [b.id, b]));
    const targetBlockMap = new Map<string, Block>(targetBlocks.map(b => [b.id, b]));

    // 4. Generate operations
    // A. Delete blocks that are in the current version but NOT in the target version
    for (const curBlock of currentBlocks) {
      if (!targetBlockMap.has(curBlock.id)) {
        restoreOpsToCreate.push({
          operationId: generateUUID(),
          documentId,
          clientId,
          lamportTimestamp: baseTimestamp++,
          operationType: 'DELETE_BLOCK',
          payload: JSON.stringify({ blockId: curBlock.id }),
        });
      }
    }

    // B. Re-insert or update/move blocks from the target version
    let prevId: string | null = null;
    for (const tarBlock of targetBlocks) {
      const existsInCurrent = currentBlockMap.get(tarBlock.id);

      if (!existsInCurrent) {
        // Node was deleted since target version; recreate it
        restoreOpsToCreate.push({
          operationId: generateUUID(),
          documentId,
          clientId,
          lamportTimestamp: baseTimestamp++,
          operationType: 'INSERT_BLOCK',
          payload: JSON.stringify({
            blockId: tarBlock.id,
            type: tarBlock.type,
            content: tarBlock.content,
            prevId,
          }),
        });
      } else {
        // Node exists; check if content or type changed
        if (existsInCurrent.content !== tarBlock.content || existsInCurrent.type !== tarBlock.type) {
          restoreOpsToCreate.push({
            operationId: generateUUID(),
            documentId,
            clientId,
            lamportTimestamp: baseTimestamp++,
            operationType: 'UPDATE_BLOCK',
            payload: JSON.stringify({
              blockId: tarBlock.id,
              content: tarBlock.content,
            }),
          });
        }

        // Check if position changed
        if (existsInCurrent.prevId !== prevId) {
          restoreOpsToCreate.push({
            operationId: generateUUID(),
            documentId,
            clientId,
            lamportTimestamp: baseTimestamp++,
            operationType: 'MOVE_BLOCK',
            payload: JSON.stringify({
              blockId: tarBlock.id,
              prevId,
            }),
          });
        }
      }

      prevId = tarBlock.id;
    }

    // 5. Save all generated operations to database inside a transaction
    if (restoreOpsToCreate.length > 0) {
      await db.$transaction(async (tx) => {
        // Insert operations
        await tx.documentOperation.createMany({
          data: restoreOpsToCreate,
        });

        // Set document content to targetBlocks representation
        await tx.document.update({
          where: { id: documentId },
          data: {
            content: targetVersion.snapshot,
            updatedAt: new Date(),
          },
        });
      });
    }

    return Response.json({
      success: true,
      message: `Version restored. Generated ${restoreOpsToCreate.length} operations.`,
      operationCount: restoreOpsToCreate.length,
    });
  } catch (error) {
    console.error('Failed to restore version:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

// Zod Schema to validate each operation payload strictly
const operationSchema = z.object({
  operationId: z.string().uuid(),
  documentId: z.string().uuid(),
  clientId: z.string().uuid(),
  lamportTimestamp: z.number().int().nonnegative(),
  operationType: z.enum(['INSERT_BLOCK', 'UPDATE_BLOCK', 'DELETE_BLOCK', 'MOVE_BLOCK', 'SET_TITLE']),
  payload: z.string().max(100000), // Max 100KB per individual operation payload
  createdAt: z.number().int().nonnegative(),
});

const syncPayloadSchema = z.object({
  operations: z.array(operationSchema).max(200), // Max 200 operations per batch request
});

/**
 * Checks the nesting depth of a parsed JSON value to prevent stack overflows / DOS.
 */
function getJsonDepth(val: unknown): number {
  if (val === null || typeof val !== 'object') return 0;
  const obj = val as Record<string, unknown>;
  let maxDepth = 0;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      maxDepth = Math.max(maxDepth, getJsonDepth(obj[key]));
    }
  }
  return 1 + maxDepth;
}

/**
 * POST /api/sync
 * Pushes local client operations and returns missing server operations.
 */
export async function POST(req: Request) {
  try {
    // 1. Session verification
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized: Session missing' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. OOM Limit Request Size Check (<1MB)
    const contentLenHeader = req.headers.get('content-length');
    if (contentLenHeader) {
      const sizeBytes = parseInt(contentLenHeader, 10);
      if (sizeBytes > 1024 * 1024) {
        console.warn(`Blocked suspicious sync attempt: payload too large (${sizeBytes} bytes) from user ${userId}`);
        return Response.json({ error: 'Payload too large (1MB limit)' }, { status: 413 });
      }
    }

    const body = await req.json();

    // 3. Zod validation of operation array
    const parsedBody = syncPayloadSchema.safeParse(body);
    if (!parsedBody.success) {
      console.warn(`Rejected invalid sync structure from user ${userId}:`, parsedBody.error);
      return Response.json({ error: 'Invalid payload schema', details: parsedBody.error.format() }, { status: 400 });
    }

    const { operations } = parsedBody.data;
    if (operations.length === 0) {
      return Response.json({ success: true, syncedIds: [], newOperations: [] });
    }

    // 4. Verify Document Access and Role-Based Access Control (RBAC)
    const documentId = operations[0].documentId;
    
    // Strict Tenant Isolation Check
    const membership = await db.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId,
        },
      },
    });

    if (!membership) {
      return Response.json({ error: 'Access denied: Document member membership not found' }, { status: 403 });
    }

    // VIEWERS cannot submit operations
    if (membership.role === 'VIEWER') {
      console.warn(`Denied write operations from viewer user ${userId} on doc ${documentId}`);
      return Response.json({ error: 'Forbidden: Viewers cannot make edits' }, { status: 403 });
    }

    const syncedIds: string[] = [];
    let clientMaxTimestamp = 0;

    // 5. Process operations transactionally
    await db.$transaction(async (tx) => {
      for (const op of operations) {
        // Enforce document integrity scope
        if (op.documentId !== documentId) {
          throw new Error('All operations in a batch must belong to the same document');
        }

        // Keep track of largest timestamp the client has pushed
        if (op.lamportTimestamp > clientMaxTimestamp) {
          clientMaxTimestamp = op.lamportTimestamp;
        }

        // Nesting depth check on operation payload string to protect merge engine
        let parsedPayload: unknown;
        try {
          parsedPayload = JSON.parse(op.payload);
        } catch {
          throw new Error(`Malformed JSON in operation payload: ${op.operationId}`);
        }

        if (getJsonDepth(parsedPayload) > 5) {
          throw new Error(`Suspicious nesting depth detected in operation: ${op.operationId}`);
        }

        // Idempotent insertion
        const exists = await tx.documentOperation.findUnique({
          where: { operationId: op.operationId },
        });

        if (!exists) {
          await tx.documentOperation.create({
            data: {
              operationId: op.operationId,
              documentId: op.documentId,
              clientId: op.clientId,
              lamportTimestamp: op.lamportTimestamp,
              operationType: op.operationType,
              payload: op.payload,
            },
          });
        }
        syncedIds.push(op.operationId);
      }

      // Update the document's updatedAt timestamp
      await tx.document.update({
        where: { id: documentId },
        data: { updatedAt: new Date() },
      });
    });

    // 6. Pull and return operations submitted by other clients that this client has not seen
    const newOperations = await db.documentOperation.findMany({
      where: {
        documentId,
        // Exclude operations made by the current client in this session
        clientId: { not: operations[0].clientId },
        // Return ops that have a higher Lamport timestamp than the client's current max
        lamportTimestamp: { gt: clientMaxTimestamp },
      },
      orderBy: [
        { lamportTimestamp: 'asc' },
        { clientId: 'asc' },
      ],
    });

    // Format server operations back to the client shape
    const formattedNewOps = newOperations.map(op => ({
      operationId: op.operationId,
      documentId: op.documentId,
      clientId: op.clientId,
      lamportTimestamp: op.lamportTimestamp,
      operationType: op.operationType as 'INSERT_BLOCK' | 'UPDATE_BLOCK' | 'DELETE_BLOCK' | 'MOVE_BLOCK' | 'SET_TITLE',
      payload: op.payload,
      createdAt: op.createdAt.getTime(),
      isSynced: 1,
    }));

    return Response.json({
      success: true,
      syncedIds,
      newOperations: formattedNewOps,
    });
  } catch (error) {
    const err = error as Error;
    console.error('API sync execution failed:', err);
    return Response.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * GET /api/sync
 * Pulls latest operations since a specific timestamp.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');
    const lastTimestampStr = searchParams.get('lastTimestamp');

    if (!documentId) {
      return Response.json({ error: 'Missing documentId' }, { status: 400 });
    }

    const lastTimestamp = lastTimestampStr ? parseInt(lastTimestampStr, 10) : 0;

    // Check membership
    const membership = await db.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const newOperations = await db.documentOperation.findMany({
      where: {
        documentId,
        lamportTimestamp: { gt: lastTimestamp },
      },
      orderBy: [
        { lamportTimestamp: 'asc' },
        { clientId: 'asc' },
      ],
    });

    const formattedNewOps = newOperations.map(op => ({
      operationId: op.operationId,
      documentId: op.documentId,
      clientId: op.clientId,
      lamportTimestamp: op.lamportTimestamp,
      operationType: op.operationType as 'INSERT_BLOCK' | 'UPDATE_BLOCK' | 'DELETE_BLOCK' | 'MOVE_BLOCK' | 'SET_TITLE',
      payload: op.payload,
      createdAt: op.createdAt.getTime(),
      isSynced: 1,
    }));

    return Response.json({
      success: true,
      newOperations: formattedNewOps,
    });
  } catch (error) {
    console.error('API sync pull failed:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

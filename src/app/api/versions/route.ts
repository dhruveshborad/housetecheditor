import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const createVersionSchema = z.object({
  documentId: z.string().uuid(),
  snapshot: z.string().min(2), // JSON representation of blocks
  changeSummary: z.string().max(200).optional(),
});

/**
 * GET /api/versions
 * Fetches the version history timeline for a document.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return Response.json({ error: 'Missing documentId parameter' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check membership
    const membership = await db.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId,
        },
      },
    });

    if (!membership) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const versions = await db.documentVersion.findMany({
      where: { documentId },
      include: {
        author: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ success: true, versions });
  } catch (error) {
    console.error('Failed to fetch versions:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/versions
 * Creates a new git-inspired version snapshot.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();

    const result = createVersionSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: 'Invalid parameters', details: result.error.format() }, { status: 400 });
    }

    const { documentId, snapshot, changeSummary } = result.data;

    // Check access and RBAC role (VIEWERs cannot create snapshots)
    const membership = await db.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId,
        },
      },
    });

    if (!membership) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (membership.role === 'VIEWER') {
      return Response.json({ error: 'Forbidden: Viewers cannot create versions' }, { status: 403 });
    }

    // Create version snapshot
    const newVersion = await db.documentVersion.create({
      data: {
        documentId,
        snapshot,
        authorId: userId,
        changeSummary: changeSummary || 'Manual version snapshot',
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return Response.json({ success: true, version: newVersion }, { status: 201 });
  } catch (error) {
    console.error('Failed to create version snapshot:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

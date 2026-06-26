import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>
}

const patchSchema = z.object({
  title: z.string().min(1).max(200),
});

/**
 * GET /api/documents/[id]
 * Retrieves a single document if the user is a member.
 */
export async function GET(req: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const userId = session.user.id;

    // Verify membership (Row Level Security)
    const membership = await db.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId: id,
          userId,
        },
      },
    });

    if (!membership) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const document = await db.document.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });

    if (!document) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    return Response.json({
      success: true,
      document: {
        ...document,
        userRole: membership.role,
      },
    });
  } catch (error) {
    console.error('Failed to fetch document:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH /api/documents/[id]
 * Updates document title. Requires OWNER or EDITOR role.
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const userId = session.user.id;

    const membership = await db.documentMember.findUnique({
      where: { documentId_userId: { documentId: id, userId } },
    });

    if (!membership) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    if (membership.role === 'VIEWER') {
      return Response.json({ error: 'Viewers cannot modify documents' }, { status: 403 });
    }

    const body = await req.json();
    const result = patchSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: 'Invalid parameters', details: result.error.format() }, { status: 400 });
    }

    const updated = await db.document.update({
      where: { id },
      data: { title: result.data.title },
    });

    return Response.json({ success: true, document: updated });
  } catch (error) {
    console.error('Failed to update document:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/[id]
 * Deletes a document. Only the OWNER can delete documents.
 */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const userId = session.user.id;

    // Verify user role
    const membership = await db.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId: id,
          userId,
        },
      },
    });

    if (!membership) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (membership.role !== 'OWNER') {
      return Response.json({ error: 'Forbidden: Only OWNERs can delete documents' }, { status: 403 });
    }

    // Delete document (cascade will delete members, operations, versions)
    await db.document.delete({
      where: { id },
    });

    return Response.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Failed to delete document:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

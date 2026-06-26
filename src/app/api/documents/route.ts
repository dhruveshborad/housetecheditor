import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const createDocSchema = z.object({
  title: z.string().min(1).max(100),
  workspaceId: z.string().uuid(),
});

/**
 * GET /api/documents
 * Fetches all documents the current user has membership in.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    const userId = session.user.id;

    // Fetch documents where the user is a member, optionally filtered by workspace
    const memberships = await db.documentMember.findMany({
      where: {
        userId,
        document: workspaceId ? { workspaceId } : undefined,
      },
      include: {
        document: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, image: true },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const documents = memberships.map(m => ({
      ...m.document,
      userRole: m.role,
    }));

    return Response.json({ success: true, documents });
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/documents
 * Creates a new document and initializes the creator as the OWNER member.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();

    const result = createDocSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: 'Invalid parameters', details: result.error.format() }, { status: 400 });
    }

    const { title, workspaceId } = result.data;

    // Verify workspace access: Must be workspace owner or member
    const workspace = await db.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId, // currently only owners can add docs, or we can expand
      },
    });

    if (!workspace) {
      return Response.json({ error: 'Workspace not found or unauthorized' }, { status: 403 });
    }

    // Create the document and Member in a transaction
    const newDoc = await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          title,
          workspaceId,
          createdBy: userId,
          content: '[]', // Start empty JSON block array
        },
      });

      await tx.documentMember.create({
        data: {
          documentId: doc.id,
          userId,
          role: 'OWNER', // Creator gets OWNER role
        },
      });

      return doc;
    });

    return Response.json({ success: true, document: newDoc }, { status: 201 });
  } catch (error) {
    console.error('Failed to create document:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

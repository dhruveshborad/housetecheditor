import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

/**
 * GET /api/workspaces
 * Fetches all workspaces owned by the current user.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const workspaces = await db.workspace.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ success: true, workspaces });
  } catch (error) {
    console.error('Failed to fetch workspaces:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/workspaces
 * Creates a new workspace.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();

    const result = createWorkspaceSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: 'Invalid parameters', details: result.error.format() }, { status: 400 });
    }

    const newWorkspace = await db.workspace.create({
      data: {
        name: result.data.name,
        ownerId: userId,
      },
    });

    return Response.json({ success: true, workspace: newWorkspace }, { status: 201 });
  } catch (error) {
    console.error('Failed to create workspace:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

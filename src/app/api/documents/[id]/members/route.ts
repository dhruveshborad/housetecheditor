import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>
}

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['EDITOR', 'VIEWER']),
});

const removeMemberSchema = z.object({
  userId: z.string().uuid(),
});

/**
 * GET /api/documents/[id]/members
 * Lists all members of a document with their roles.
 */
export async function GET(req: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: documentId } = await context.params;
    const userId = session.user.id;

    // Verify requester is a member
    const requesterMembership = await db.documentMember.findUnique({
      where: { documentId_userId: { documentId, userId } },
    });

    if (!requesterMembership) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const members = await db.documentMember.findMany({
      where: { documentId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return Response.json({ success: true, members });
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/documents/[id]/members
 * Invites a user by email to a document. Only OWNER can invite.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: documentId } = await context.params;
    const userId = session.user.id;

    // Only OWNER can invite members
    const requesterMembership = await db.documentMember.findUnique({
      where: { documentId_userId: { documentId, userId } },
    });

    if (!requesterMembership || requesterMembership.role !== 'OWNER') {
      return Response.json({ error: 'Only document owners can invite members' }, { status: 403 });
    }

    const body = await req.json();
    const result = addMemberSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: 'Invalid parameters', details: result.error.format() }, { status: 400 });
    }

    const { email, role } = result.data;

    // Find user by email or create a ghost user if they don't exist yet
    let targetUser = await db.user.findUnique({ where: { email } });
    
    if (!targetUser) {
      // Auto-create a ghost user so the invite succeeds. 
      // They can set up a password later when they register.
      targetUser = await db.user.create({
        data: {
          email,
          name: email.split('@')[0], // fallback name
        }
      });
    }

    // Cannot add yourself
    if (targetUser.id === userId) {
      return Response.json({ error: 'Cannot add yourself as a member' }, { status: 400 });
    }

    // Check if already a member
    const existingMembership = await db.documentMember.findUnique({
      where: { documentId_userId: { documentId, userId: targetUser.id } },
    });

    if (existingMembership) {
      // Update role if already a member
      const updated = await db.documentMember.update({
        where: { documentId_userId: { documentId, userId: targetUser.id } },
        data: { role },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });
      return Response.json({ success: true, member: updated, updated: true });
    }

    const newMember = await db.documentMember.create({
      data: {
        documentId,
        userId: targetUser.id,
        role,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return Response.json({ success: true, member: newMember }, { status: 201 });
  } catch (error) {
    console.error('Failed to add member:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/[id]/members
 * Removes a member from the document. Only OWNER can remove members.
 * The OWNER cannot remove themselves.
 */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: documentId } = await context.params;
    const userId = session.user.id;

    // Only OWNER can remove members
    const requesterMembership = await db.documentMember.findUnique({
      where: { documentId_userId: { documentId, userId } },
    });

    if (!requesterMembership || requesterMembership.role !== 'OWNER') {
      return Response.json({ error: 'Only document owners can remove members' }, { status: 403 });
    }

    const body = await req.json();
    const result = removeMemberSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { userId: targetUserId } = result.data;

    // Owner cannot remove themselves
    if (targetUserId === userId) {
      return Response.json({ error: 'The document owner cannot remove themselves' }, { status: 400 });
    }

    await db.documentMember.delete({
      where: { documentId_userId: { documentId, userId: targetUserId } },
    });

    return Response.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Failed to remove member:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { db } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(50),
});

/**
 * POST /api/auth/register
 * Handles local user account registration.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const result = registerSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: 'Invalid parameters', details: result.error.format() }, { status: 400 });
    }

    const { name, email, password } = result.data;

    // Check if email already exists
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    // Hash the password
    const hashedPassword = hashPassword(password);

    let newUser;
    
    if (existingUser) {
      if (existingUser.password) {
        return Response.json({ error: 'Email is already registered' }, { status: 409 });
      }

      // Claim the ghost user (or OAuth user without a password)
      newUser = await db.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name,
            password: hashedPassword,
          },
        });

        // Initialize workspace if missing
        const existingWorkspace = await tx.workspace.findFirst({ where: { ownerId: user.id } });
        if (!existingWorkspace) {
          await tx.workspace.create({
            data: {
              name: `${name}'s Workspace`,
              ownerId: user.id,
            },
          });
        }
        return user;
      });
    } else {
      // Create new User and default Workspace
      newUser = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
          },
        });

        await tx.workspace.create({
          data: {
            name: `${name}'s Workspace`,
            ownerId: user.id,
          },
        });

        return user;
      });
    }

    return Response.json({
      success: true,
      message: 'Account registered successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Registration failed:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

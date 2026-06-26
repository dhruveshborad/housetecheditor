import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { db } from '@/lib/db';
import credentials from 'next-auth/providers/credentials';
import google from 'next-auth/providers/google';
import { verifyPassword } from '@/lib/crypto';
import { z } from 'zod';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  secret: process.env.AUTH_SECRET,
  providers: [
    google({
      clientId: process.env.GOOGLE_ID || 'mock',
      clientSecret: process.env.GOOGLE_SECRET || 'mock',
      allowDangerousEmailAccountLinking: true,
    }),
    credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const { email, password } = parsedCredentials.data;
        const user = await db.user.findUnique({ where: { email } });
        
        if (!user || !user.password) {
          return null;
        }

        const passwordsMatch = verifyPassword(password, user.password);
        if (passwordsMatch) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          };
        }

        return null;
      },
    }),
  ],
});
export type { Session } from 'next-auth';

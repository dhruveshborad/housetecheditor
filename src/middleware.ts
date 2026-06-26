import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export default NextAuth(authConfig).auth;

export const config = {
  // Protects dashboard, workspaces, settings, profile pages, and blocks routing checks on static assets
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|auth/login|auth/register|$).*)'],
};

import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import { SERVER_API_BASE_URL } from '@/lib/api/config';

// La session du site dure tant que le jeton du backend (7 jours) : elle est revérifiée auprès du backend
// toutes les 5 minutes, pour qu'un compte supprimé soit déconnecté et qu'un changement de rôle ou de statut
// d'entreprise (validation, suspension) s'affiche sans se reconnecter.
const SESSION_CHECK_MS = 5 * 60 * 1000;

async function checkSession(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${SERVER_API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 404) return { error: 'SessionRevoked' };
    if (!res.ok) return token;
    const data = await res.json();
    return {
      ...token,
      role: data.user.role,
      companyId: data.company?.id ?? null,
      companyName: data.company?.name ?? null,
      companyStatus: data.company?.status ?? null,
      checkedAt: Date.now(),
    };
  } catch {
    // Backend injoignable : la session est gardée, nouvel essai à la prochaine lecture
    return token;
  }
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Identifiants',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const res = await fetch(`${SERVER_API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        });

        if (!res.ok) return null;

        const data = await res.json();

        return {
          id: data.user.id,
          name: `${data.user.firstName} ${data.user.lastName}`,
          email: data.user.email,
          role: data.user.role,
          companyId: data.company?.id ?? null,
          companyName: data.company?.name ?? null,
          companyStatus: data.company?.status ?? null,
          accessToken: data.token,
        };
      },
    }),
  ],
  debug: process.env.NODE_ENV === 'development',
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.role = user.role;
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.companyStatus = user.companyStatus;
        token.checkedAt = Date.now();
        return token;
      }
      if (!token.accessToken || Date.now() - (token.checkedAt ?? 0) < SESSION_CHECK_MS) return token;
      return checkSession(token);
    },
    async session({ session, token }) {
      // Session révoquée : SessionGuard déconnecte le navigateur
      if (token.error) return { ...session, user: undefined, accessToken: undefined, error: token.error };
      if (session.user) {
        session.accessToken = token.accessToken;
        session.user.role = token.role;
        session.user.companyId = token.companyId;
        session.user.companyName = token.companyName;
        session.user.companyStatus = token.companyStatus;
      }
      return session;
    },
  },
  pages: {
    signIn: '/connexion',
    error: '/connexion',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };

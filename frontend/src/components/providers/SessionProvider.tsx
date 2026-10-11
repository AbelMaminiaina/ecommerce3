'use client';

import { SessionProvider as NextAuthSessionProvider, signOut, useSession } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';

interface Props {
  children: ReactNode;
}

// Session révoquée par le backend (compte supprimé…) : on déconnecte le navigateur et on renvoie à la connexion
function SessionGuard() {
  const { data: session } = useSession();
  const revoked = session?.error === 'SessionRevoked';

  useEffect(() => {
    if (revoked) signOut({ callbackUrl: '/connexion' });
  }, [revoked]);

  return null;
}

export function SessionProvider({ children }: Props) {
  return (
    <NextAuthSessionProvider>
      <SessionGuard />
      {children}
    </NextAuthSessionProvider>
  );
}

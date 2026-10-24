import type { CompanyStatus, UserRole } from '@/types';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    // Compte supprimé ou session refusée par le backend : le navigateur doit se déconnecter
    error?: 'SessionRevoked';
    user?: {
      name?: string | null;
      email?: string | null;
      /** Téléphone du compte (vérifié par SMS pour un compte créé par téléphone) */
      phone?: string | null;
      image?: string | null;
      role?: UserRole;
      companyId?: string | null;
      companyName?: string | null;
      companyStatus?: CompanyStatus | null;
    };
  }

  interface User {
    phone?: string | null;
    role: UserRole;
    companyId: string | null;
    companyName?: string | null;
    companyStatus?: CompanyStatus | null;
    accessToken: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    phone?: string | null;
    role?: UserRole;
    companyId?: string | null;
    companyName?: string | null;
    companyStatus?: CompanyStatus | null;
    // Dernière vérification de la session auprès du backend (ms)
    checkedAt?: number;
    error?: 'SessionRevoked';
  }
}

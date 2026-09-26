'use client';

import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

// Sur sa propre boutique, le vendeur voit un raccourci vers la gestion de ses produits.
export function SellerOwnerLink({ sellerId }: { sellerId: string }) {
  const { data: session } = useSession();
  if (session?.user?.companyId !== sellerId || session?.user?.companyStatus !== 'approved') return null;

  return (
    <Link href="/vendeur" className="sw-btn-ghost">
      <i className="bi bi-gear"></i>Gérer mes produits
    </Link>
  );
}

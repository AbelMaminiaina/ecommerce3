'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCompanyAccess } from '@/hooks/useCompanyAccess';
import { AdminShell, type ShellNavGroup } from '@/components/admin/AdminShell';

// Espace vendeur : réservé aux comptes d'une entreprise approuvée.
// Même thème que l'administration (template ShopWise admin), étiquette « Vendeur ».
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { status } = useCompanyAccess();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/connexion?callbackUrl=/vendeur');
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-prairie-600" />
      </div>
    );
  }

  if (status !== 'approved') {
    const message =
      status === 'pending'
        ? 'Votre compte entreprise est en attente de validation. Vous pourrez publier des produits dès son approbation.'
        : status === 'customer'
          ? 'L’espace vendeur est réservé aux entreprises. Créez un compte professionnel pour publier vos produits.'
          : status === 'platform_admin'
            ? 'Les administrateurs valident les produits depuis le tableau de bord admin.'
            : 'Votre compte entreprise ne permet pas de publier des produits pour le moment.';
    return (
      <div className="flex min-h-screen items-center justify-center bg-warm-800 p-4">
        <div className="w-full max-w-md">
          <div className="admin-sidebar !static !w-auto !bg-transparent !transform-none mb-4">
            <div className="brand justify-center !border-0">
              <i className="bi bi-cart2"></i>
              <span className="sitename">Tsena Pro</span>
              <span className="brand-tag">Vendeur</span>
            </div>
          </div>
          <div className="panel p-8 text-center">
            <span className="move-icon tone-warning mx-auto mb-4 !h-14 !w-14 !text-2xl">
              <i className="bi bi-shop"></i>
            </span>
            <h1 className="mb-3 text-2xl">Espace vendeur</h1>
            <p className="mb-6">{message}</p>
            <Link
              href={status === 'platform_admin' ? '/admin/produits' : status === 'customer' ? '/inscription' : '/'}
              className="sw-btn btn-accent"
            >
              {status === 'platform_admin' ? 'Produits à valider' : status === 'customer' ? 'Créer un compte pro' : "Retour à l'accueil"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const companyId = session?.user?.companyId;
  const navigation: ShellNavGroup[] = [
    {
      label: 'Mon activité',
      items: [
        { name: 'Mes produits', href: '/vendeur', icon: 'bi-box-seam' },
        { name: 'Commandes reçues', href: '/vendeur/commandes', icon: 'bi-receipt' },
        { name: 'Mes gains', href: '/vendeur/reversements', icon: 'bi-wallet2' },
      ],
    },
    {
      label: 'Catalogue',
      items: [{ name: 'Publier un produit', href: '/vendeur/produits/nouveau', icon: 'bi-plus-square' }],
    },
    {
      label: 'Boutique',
      items: [
        ...(companyId
          ? [{ name: 'Ma page vendeur', href: `/vendeurs/${companyId}`, icon: 'bi-person-badge', external: true }]
          : []),
        { name: 'Voir la boutique', href: '/', icon: 'bi-shop', external: true },
      ],
    },
  ];

  return (
    <AdminShell
      brandTag="Vendeur"
      homeHref="/vendeur"
      navigation={navigation}
      userName={session?.user?.companyName || session?.user?.name || 'Vendeur'}
      userRole={session?.user?.companyName ? session?.user?.name || 'Vendeur' : 'Vendeur'}
      footerNote="Espace vendeur"
      topActions={
        <>
          <Link href="/vendeur/commandes" className="icon-btn" aria-label="Commandes reçues" title="Commandes reçues">
            <i className="bi bi-receipt"></i>
          </Link>
          <Link href="/vendeur/produits/nouveau" className="icon-btn" aria-label="Publier un produit" title="Publier un produit">
            <i className="bi bi-plus-lg"></i>
          </Link>
        </>
      }
    >
      {children}
    </AdminShell>
  );
}

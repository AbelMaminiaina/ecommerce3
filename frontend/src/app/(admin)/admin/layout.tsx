'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AdminShell, type ShellNavGroup } from '@/components/admin/AdminShell';

// Navigation de la barre latérale, groupée comme dans le template ShopWise (admin.html).
const adminNavigation: ShellNavGroup[] = [
  {
    label: 'Pilotage',
    items: [{ name: 'Tableau de bord', href: '/admin', icon: 'bi-grid-1x2' }],
  },
  {
    label: 'Ventes',
    items: [
      { name: 'Commandes', href: '/admin/commandes', icon: 'bi-receipt' },
      { name: 'Paiements', href: '/admin/paiements', icon: 'bi-phone' },
      { name: 'Reversements', href: '/admin/reversements', icon: 'bi-wallet2' },
    ],
  },
  {
    label: 'Vendeurs',
    items: [
      { name: 'Entreprises', href: '/admin/entreprises', icon: 'bi-building' },
      { name: 'Produits vendeurs', href: '/admin/produits', icon: 'bi-box-seam' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { name: 'Gestion de stock', href: '/admin/stocks', icon: 'bi-boxes' },
      { name: 'Catégories', href: '/admin/categories', icon: 'bi-tags' },
    ],
  },
  {
    label: 'Boutique',
    items: [{ name: 'Voir la boutique', href: '/', icon: 'bi-shop', external: true }],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  // Allow login page without authentication
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) return;

    if (status === 'unauthenticated') {
      router.push('/admin/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'platform_admin') {
      router.push('/');
    }
  }, [status, session, router, isLoginPage]);

  // Show login page directly without layout
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prairie-600"></div>
      </div>
    );
  }

  if (status === 'unauthenticated' || session?.user?.role !== 'platform_admin') {
    return null;
  }

  // Recherche de la barre supérieure : filtre la page Gestion de stock
  const handleSearch = (q: string) => {
    if (pathname === '/admin/stocks') {
      window.dispatchEvent(new CustomEvent('admin-search', { detail: q }));
    }
    router.push(q ? `/admin/stocks?q=${encodeURIComponent(q)}` : '/admin/stocks');
  };

  return (
    <AdminShell
      brandTag="Admin"
      homeHref="/admin"
      navigation={adminNavigation}
      userName={session?.user?.name || 'Administrateur'}
      userRole="Administrateur"
      search={{ placeholder: 'Rechercher un produit…', onSearch: handleSearch }}
      footerNote="Espace d'administration"
      topActions={
        <>
          <Link href="/admin/stocks" className="icon-btn" aria-label="Alertes de stock" title="Alertes de stock">
            <i className="bi bi-bell"></i>
          </Link>
          <Link href="/admin/commandes" className="icon-btn" aria-label="Commandes" title="Commandes">
            <i className="bi bi-receipt"></i>
          </Link>
        </>
      }
    >
      {children}
    </AdminShell>
  );
}

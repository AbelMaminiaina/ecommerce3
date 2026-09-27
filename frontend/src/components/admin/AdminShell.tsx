'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

export interface ShellNavItem {
  name: string;
  href: string;
  icon: string; // classe Bootstrap Icons, ex. « bi-receipt »
  external?: boolean;
}

export interface ShellNavGroup {
  label: string;
  items: ShellNavItem[];
}

interface AdminShellProps {
  brandTag: string;
  homeHref: string;
  navigation: ShellNavGroup[];
  userName: string;
  userRole: string;
  topActions?: React.ReactNode;
  search?: { placeholder: string; onSearch: (q: string) => void };
  footerNote: string;
  children: React.ReactNode;
}

// Coque du thème « admin » ShopWise (admin.html) : barre latérale, barre supérieure, pied de page.
// Partagée par l'administration (/admin) et l'espace vendeur (/vendeur).
export function AdminShell({
  brandTag,
  homeHref,
  navigation,
  userName,
  userRole,
  topActions,
  search,
  footerNote,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const initials = userName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isActive = (href: string) => (href === homeHref ? pathname === homeHref : pathname.startsWith(href));

  return (
    <div className={sidebarOpen ? 'sidebar-open' : undefined}>
      {/* Barre latérale */}
      <aside className="admin-sidebar" id="adminSidebar">
        <div className="brand">
          <Link href={homeHref} className="flex items-center gap-2.5">
            <i className="bi bi-cart2"></i>
            <span className="sitename">Tsena</span>
            <span className="brand-tag">{brandTag}</span>
          </Link>
          <button type="button" className="sidebar-close" aria-label="Fermer le menu" onClick={() => setSidebarOpen(false)}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <nav className="side-nav" aria-label="Navigation principale">
          {navigation.map((group) => (
            <React.Fragment key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                if (item.external) {
                  return (
                    <a key={item.href} href={item.href} className="side-link" target="_blank" rel="noopener">
                      <i className={`bi ${item.icon}`}></i>
                      <span>{item.name}</span>
                    </a>
                  );
                }
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`side-link${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <i className={`bi ${item.icon}`}></i>
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </React.Fragment>
          ))}
        </nav>
        <div className="side-footer">
          <button type="button" className="side-link" onClick={() => signOut({ callbackUrl: '/' })}>
            <i className="bi bi-box-arrow-left"></i>
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)}></div>

      <div className="admin-main">
        {/* Barre supérieure */}
        <header className="admin-topbar">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label="Ouvrir le menu"
            aria-controls="adminSidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <i className="bi bi-list"></i>
          </button>
          {search && (
            <form
              className="top-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                search.onSearch(query.trim());
              }}
            >
              <i className="bi bi-search"></i>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={search.placeholder}
                aria-label={search.placeholder}
              />
            </form>
          )}
          <div className="top-actions">
            {topActions}
            <div className="admin-user">
              <span className="avatar" aria-hidden="true">{initials}</span>
              <div className="who">
                <strong>{userName}</strong>
                <small>{userRole}</small>
              </div>
            </div>
          </div>
        </header>

        <main className="admin-content">{children}</main>

        <footer className="admin-footer">
          <span>
            © {new Date().getFullYear()} <strong>Tsena</strong> – {footerNote}
          </span>
          <span>Plateforme B2B</span>
        </footer>
      </div>
    </div>
  );
}

// En-tête de page ShopWise : titre, fil d'Ariane et actions à droite.
export function PageHead({
  title,
  crumbs,
  actions,
  description,
}: {
  title: string;
  crumbs: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <nav aria-label="Fil d'Ariane">
          <ol className="breadcrumb">
            {crumbs.map((crumb) => (
              <li key={crumb.label} aria-current={crumb.href ? undefined : 'page'}>
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
              </li>
            ))}
          </ol>
        </nav>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

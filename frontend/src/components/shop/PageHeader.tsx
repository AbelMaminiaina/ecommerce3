import React from 'react';
import Link from 'next/link';

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  crumbs: Crumb[];
  description?: string;
}

// Titre de page du template ShopWise (.page-title) : bandeau clair, titre à gauche, fil d'Ariane à droite.
export function PageHeader({ title, crumbs, description }: PageHeaderProps) {
  return (
    <div className="sw-page-title">
      <div className="container d-lg-flex justify-content-between align-items-center">
        <h1 className="mb-2 mb-lg-0">{title}</h1>
        <nav className="breadcrumbs" aria-label="Fil d'Ariane">
          <ol>
            <li>
              <Link href="/">Accueil</Link>
            </li>
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={crumb.label} className={last ? 'current' : undefined} aria-current={last ? 'page' : undefined}>
                  {crumb.href && !last ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
                </li>
              );
            })}
          </ol>
        </nav>
        {description && <p className="sw-page-desc">{description}</p>}
      </div>
    </div>
  );
}

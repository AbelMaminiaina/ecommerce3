import React from 'react';
import Link from 'next/link';
import type { PublicSeller } from '@/lib/api/sellers';

export const memberSinceLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

// Carte d'un vendeur (annuaire), style ShopWise : initiale, nom, responsable, ancienneté, nombre de produits.
export function SellerCard({ seller }: { seller: PublicSeller }) {
  return (
    <article className="sw-seller-card">
      <div className="seller-head">
        <span className="seller-avatar" aria-hidden="true">{seller.name.charAt(0).toUpperCase()}</span>
        <div className="seller-name">
          <h3>
            <Link href={`/vendeurs/${seller.id}`}>{seller.name}</Link>
          </h3>
          {seller.legalName && <small>{seller.legalName}</small>}
        </div>
        <span className="seller-verified" title="Entreprise vérifiée">
          <i className="bi bi-patch-check-fill"></i>
        </span>
      </div>
      <ul className="seller-facts">
        {seller.contactPerson && (
          <li>
            <i className="bi bi-person"></i>Responsable : {seller.contactPerson}
          </li>
        )}
        <li>
          <i className="bi bi-calendar3"></i>Membre depuis {memberSinceLabel(seller.memberSince)}
        </li>
        <li>
          <i className="bi bi-box-seam"></i>
          {seller.productCount} produit{seller.productCount > 1 ? 's' : ''} en vente
        </li>
      </ul>
      <Link href={`/vendeurs/${seller.id}`} className="seller-link">
        Voir la boutique <i className="bi bi-arrow-right"></i>
      </Link>
    </article>
  );
}

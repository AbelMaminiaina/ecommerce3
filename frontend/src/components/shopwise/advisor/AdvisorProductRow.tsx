'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatPrice, getProductImage } from '@/lib/utils';
import { useProductActions } from '@/components/shop/useProductActions';

interface AdvisorProductRowProps {
  product: Product;
  onNavigate?: () => void;
}

// Carte compacte (petite photo, nom, prix, bouton) : tient sur une ligne de téléphone.
// Mêmes règles B2B que les cartes du catalogue (prix pro, quantité minimum, accès).
export function AdvisorProductRow({ product, onNavigate }: AdvisorProductRowProps) {
  const { canOrder, upcoming, unavailable, unitPrice, justAdded, addToCart, buttonAriaLabel } =
    useProductActions(product);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart();
  };

  return (
    <Link href={`/produits/${product.slug}`} onClick={onNavigate} className="sw-advisor-row">
      <span className="sw-advisor-row-media">
        <Image src={getProductImage(product)} alt={product.name} fill sizes="64px" />
      </span>

      <span className="sw-advisor-row-body">
        <span className="sw-advisor-row-title">{product.name}</span>
        <span className="sw-advisor-row-price">
          {formatPrice(unitPrice)}
          <small>/{product.unit}</small>
        </span>
        {unavailable && <span className="sw-advisor-row-note">Rupture de stock</span>}
      </span>

      {canOrder && !unavailable && (
        <button
          type="button"
          onClick={handleAddToCart}
          aria-label={`${buttonAriaLabel} : ${product.name}`}
          title={buttonAriaLabel}
          className={`sw-cart-btn${justAdded ? ' added' : ''}`}
        >
          <i className={`bi ${justAdded ? 'bi-check-lg' : upcoming ? 'bi-calendar-plus' : 'bi-bag-plus'}`}></i>
        </button>
      )}
    </Link>
  );
}

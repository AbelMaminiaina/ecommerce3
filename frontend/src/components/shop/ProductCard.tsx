'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import {
  formatDate,
  formatPrice,
  formatQuantity,
  getBadgeLabel,
  getCategoryLabel,
  getProductImage,
} from '@/lib/utils';
import { useProductActions } from './useProductActions';
import { StarRating } from './StarRating';

interface ProductCardProps {
  product: Product;
  /** Position dans la grille (conservé pour compatibilité avec les appels existants). */
  index?: number;
}

// Carte produit du template ShopWise (« Best Sellers ») : image carrée avec badges et actions au
// survol, catégorie + note, nom, informations B2B, puis prix et bouton panier en pied de carte.
// Les règles B2B (quantité minimum, paliers, accès) viennent de useProductActions.
export function ProductCard({ product }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const {
    isApproved,
    canOrder,
    wished,
    upcoming,
    unavailable,
    unitPrice,
    bestTierPrice,
    justAdded,
    addToCart,
    toggleWishlist,
    buttonAriaLabel,
  } = useProductActions(product);
  const href = `/produits/${product.slug}`;

  return (
    <article className="sw-product">
      <div className="sw-product-media">
        {!imageError ? (
          <Image
            src={getProductImage(product)}
            alt={product.name}
            width={400}
            height={400}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 25vw"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="d-flex align-items-center justify-content-center w-100 h-100 text-muted">
            Image indisponible
          </div>
        )}

        {product.badges.length > 0 && (
          <div className="sw-product-badges">
            {product.badges.map((badge) => (
              <span key={badge} className={`sw-badge ${badge}`}>
                {getBadgeLabel(badge)}
              </span>
            ))}
          </div>
        )}

        <div className="sw-product-actions">
          <button
            type="button"
            onClick={toggleWishlist}
            aria-pressed={wished}
            aria-label={wished ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className={`sw-icon-btn${wished ? ' active' : ''}`}
          >
            <i className={`bi ${wished ? 'bi-heart-fill' : 'bi-heart'}`}></i>
          </button>
          <Link href={href} className="sw-icon-btn" aria-label={`Voir ${product.name}`}>
            <i className="bi bi-eye"></i>
          </Link>
        </div>

        {unavailable && (
          <div className="sw-soldout">
            <span>Rupture de stock</span>
          </div>
        )}
      </div>

      <div className="sw-product-body">
        <div className="sw-product-meta">
          <Link href={`/produits?categorie=${product.category}`} className="sw-category-tag">
            {getCategoryLabel(product.category)}
          </Link>
          <Link href={`${href}#avis`} aria-label="Voir les avis" className="text-decoration-none">
            <StarRating value={product.rating} count={product.reviewCount} showCount={false} />
          </Link>
        </div>

        <h3 className="sw-product-title">
          <Link href={href}>{product.name}</Link>
        </h3>

        <div className="sw-product-notes">
          {product.seller && (
            <span>
              <i className="bi bi-shop"></i>Vendu par{' '}
              <Link href={`/vendeurs/${product.seller.id}`}>{product.seller.name}</Link>
            </span>
          )}
          <span>
            <i className="bi bi-box"></i>Quantité minimum&nbsp;: {formatQuantity(product.moq, product.unit)}
          </span>
          {bestTierPrice && bestTierPrice < product.price && (
            <span className="sw-note-accent">
              <i className="bi bi-graph-down-arrow"></i>
              {isApproved ? <>à partir de {formatPrice(bestTierPrice)} en gros</> : <>tarifs dégressifs pour les pros</>}
            </span>
          )}
          {product.freeShipping && (
            <span className="sw-note-accent">
              <i className="bi bi-truck"></i>Livraison offerte
            </span>
          )}
          {upcoming && (
            <span className="sw-note-warn">
              <i className="bi bi-calendar-event"></i>Disponible le {formatDate(product.availableFrom!)}
            </span>
          )}
        </div>

        <div className="sw-product-footer">
          <div className="sw-product-price">
            <span className={product.originalPrice ? 'current' : undefined}>{formatPrice(unitPrice)}</span>
            {product.originalPrice && <span className="original">{formatPrice(product.originalPrice)}</span>}
            <small>/{product.unit}</small>
          </div>
          {canOrder && (
            <button
              type="button"
              onClick={addToCart}
              disabled={unavailable}
              aria-label={buttonAriaLabel}
              title={buttonAriaLabel}
              className={`sw-cart-btn${justAdded ? ' added' : ''}`}
            >
              <i className={`bi ${justAdded ? 'bi-check-lg' : upcoming ? 'bi-calendar-plus' : 'bi-bag-plus'}`}></i>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

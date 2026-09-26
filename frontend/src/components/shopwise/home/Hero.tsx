import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatPrice, getBadgeLabel, getProductImage, truncate } from '@/lib/utils';
import { HeroCarousel } from './HeroCarousel';

const TILE_TAGS = ['Meilleure vente', 'Tendance', 'Nouveauté'];

function tileTag(product: Product, index: number) {
  if (product.badges.includes('populaire')) return getBadgeLabel('populaire');
  if (product.badges.includes('nouveau')) return getBadgeLabel('nouveau');
  return TILE_TAGS[index];
}

function TilePrice({ product }: { product: Product }) {
  return (
    <div className="sw-price">
      <span className="now">{formatPrice(product.price)}</span>
      {product.originalPrice && <span className="was">{formatPrice(product.originalPrice)}</span>}
      <span className="unit">/{product.unit}</span>
    </div>
  );
}

// « Hero » du template ShopWise : accroche à gauche, trois tuiles produit à droite, carrousel dessous.
export function Hero({ tiles, carousel }: { tiles: Product[]; carousel: Product[] }) {
  const [first, second, third] = tiles;

  return (
    <section className="sw-hero">
      <div className="container">
        <div className="row align-items-center g-5">
          <div className="col-lg-5">
            <span className="sw-pill">Vente en gros</span>
            <h1 className="sw-hero-title">Le matériel high-tech des professionnels</h1>
            <p className="sw-hero-sub">
              Smartphones, ordinateurs, photo et accessoires : commandez en gros auprès de vendeurs vérifiés,
              profitez de tarifs dégressifs et payez par Mobile Money.
            </p>
            <div className="sw-hero-actions">
              <Link href="/produits" className="sw-btn-primary">Parcourir le catalogue</Link>
              <Link href="#categories" className="sw-btn-ghost">
                <i className="bi bi-arrow-right"></i>Voir les catégories
              </Link>
            </div>
            <div className="sw-trust">
              <div><i className="bi bi-truck"></i><span>Livraison</span></div>
              <div><i className="bi bi-shield-check"></i><span>Vendeurs vérifiés</span></div>
              <div><i className="bi bi-percent"></i><span>Tarifs dégressifs</span></div>
              <div><i className="bi bi-phone"></i><span>Mobile Money</span></div>
            </div>
          </div>

          {first && (
            <div className="col-lg-7">
              <div className="row g-3">
                {[first, second].filter(Boolean).map((product, i) => (
                  <div key={product.id} className="col-md-6">
                    <Link href={`/produits/${product.slug}`} className={`sw-tile${i === 1 ? ' featured' : ''}`}>
                      <div className="sw-tile-image">
                        <Image src={getProductImage(product)} alt={product.name} width={320} height={320} sizes="(max-width: 768px) 60vw, 25vw" />
                        <span className={`sw-tag${i === 1 ? ' accent' : ''}`}>{tileTag(product, i)}</span>
                      </div>
                      <div className="sw-tile-info">
                        <h4>{product.name}</h4>
                        <TilePrice product={product} />
                      </div>
                    </Link>
                  </div>
                ))}
                {third && (
                  <div className="col-12">
                    <Link href={`/produits/${third.slug}`} className="sw-tile horizontal">
                      <div className="row g-0 align-items-stretch h-100">
                        <div className="col-sm-4">
                          <div className="sw-tile-image">
                            <Image src={getProductImage(third)} alt={third.name} width={320} height={320} sizes="(max-width: 576px) 60vw, 20vw" />
                            <span className="sw-tag">{tileTag(third, 2)}</span>
                          </div>
                        </div>
                        <div className="col-sm-8 d-flex align-items-center">
                          <div className="sw-tile-info">
                            <h4>{third.name}</h4>
                            <p className="sw-tile-desc">{truncate(third.shortDescription || third.description, 140)}</p>
                            <TilePrice product={third} />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {carousel.length > 0 && <HeroCarousel products={carousel} />}
      </div>
    </section>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { formatPrice, getBadgeLabel, getProductImage, truncate } from '@/lib/utils';

const AUTOPLAY_MS = 4000;

// Carrousel du hero ShopWise (défilement horizontal avec accroche) : flèches, points et lecture
// automatique mise en pause au survol ou dès que le visiteur interagit.
export function HeroCarousel({ products }: { products: Product[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const total = Math.max(1, Math.ceil(track.scrollWidth / track.clientWidth - 0.05));
    setPages(total);
    setPage(Math.min(total - 1, Math.round(track.scrollLeft / track.clientWidth)));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const goTo = useCallback((target: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = (target + pages) % pages;
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  }, [pages]);

  useEffect(() => {
    if (paused || stopped || pages < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => goTo(page + 1), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [paused, stopped, pages, page, goTo]);

  const userGo = (target: number) => {
    setStopped(true);
    goTo(target);
  };

  return (
    <div className="sw-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="sw-carousel-track" ref={trackRef} onScroll={measure} onTouchStart={() => setStopped(true)}>
        {products.map((product) => {
          const badge = product.badges.find((b) => b === 'nouveau' || b === 'populaire' || b === 'promo');
          return (
            <div key={product.id} className="sw-slide">
              <Link href={`/produits/${product.slug}`} className="sw-tile">
                <div className="sw-tile-image">
                  <Image src={getProductImage(product)} alt={product.name} width={280} height={280} sizes="(max-width: 576px) 80vw, 25vw" />
                  {badge && <span className={`sw-tag${badge === 'populaire' ? ' accent' : ''}`}>{getBadgeLabel(badge)}</span>}
                </div>
                <div className="sw-tile-info">
                  <h4>{product.name}</h4>
                  <p className="sw-tile-desc">{truncate(product.shortDescription || product.description, 60)}</p>
                  <div className="sw-price">
                    <span className="now">{formatPrice(product.price)}</span>
                    {product.originalPrice && <span className="was">{formatPrice(product.originalPrice)}</span>}
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <>
          <button type="button" className="sw-carousel-nav prev" aria-label="Produits précédents" onClick={() => userGo(page - 1)}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <button type="button" className="sw-carousel-nav next" aria-label="Produits suivants" onClick={() => userGo(page + 1)}>
            <i className="bi bi-chevron-right"></i>
          </button>
          <div className="sw-dots">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                className={i === page ? 'active' : undefined}
                aria-label={`Aller à la page ${i + 1}`}
                aria-current={i === page}
                onClick={() => userGo(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

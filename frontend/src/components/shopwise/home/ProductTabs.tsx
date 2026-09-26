'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/types';
import { ProductCard } from '@/components/shop/ProductCard';

type TabId = 'nouveautes' | 'populaires' | 'tous';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'nouveautes', label: 'Nouveautés', icon: 'bi-stars' },
  { id: 'populaires', label: 'Tendances', icon: 'bi-fire' },
  { id: 'tous', label: 'Tout le catalogue', icon: 'bi-bookmark-star' },
];

// Section « Cards » du template ShopWise : onglets soulignés et grille de cartes produit.
export function ProductTabs({ tabs }: { tabs: Record<TabId, Product[]> }) {
  const visibleTabs = TABS.filter((t) => tabs[t.id].length > 0);
  const [active, setActive] = useState<TabId>(visibleTabs[0]?.id ?? 'tous');

  if (visibleTabs.length === 0) return null;

  return (
    <section id="nouveautes" className="sw-section sw-light">
      <div className="container">
        <div className="sw-tab-nav">
          <ul className="sw-tabs" role="tablist" aria-label="Filtrer les produits">
            {visibleTabs.map((tab) => (
              <li key={tab.id} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={active === tab.id}
                  className={active === tab.id ? 'active' : undefined}
                  onClick={() => setActive(tab.id)}
                >
                  <i className={`bi ${tab.icon}`}></i> {tab.label}
                </button>
              </li>
            ))}
          </ul>
          <Link href="/produits" className="sw-tab-link">
            Voir tout le catalogue <i className="bi bi-arrow-right"></i>
          </Link>
        </div>

        <div className="row g-3" role="tabpanel">
          {tabs[active].map((product) => (
            <div key={product.id} className="col-xl-3 col-lg-4 col-md-6">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

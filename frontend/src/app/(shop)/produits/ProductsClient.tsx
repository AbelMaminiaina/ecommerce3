'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import type { Product, ProductBadge } from '@/types';
import { useCategories } from '@/hooks/useCategories';
import { formatPrice, getBadgeLabel, getProductImage, isUpcoming } from '@/lib/utils';
import { PageHeader } from '@/components/shop/PageHeader';
import { ProductCard } from '@/components/shop/ProductCard';

interface ProductsClientProps {
  initialProducts: Product[];
}

type SortKey = 'default' | 'popularity' | 'newness' | 'rating' | 'price-asc' | 'price-desc';
type ViewMode = 'grid' | 'list';
type Availability = 'all' | 'stock' | 'preorder' | 'out';

const PAGE_SIZE = 9;
const normalize = (slug: string) => slug.replace(/_/g, '-');
const unitLabel = (unit: string) => (unit === 'piece' ? 'pièce' : unit);

const availabilityOf = (p: Product): Exclude<Availability, 'all'> =>
  isUpcoming(p.availableFrom) ? 'preorder' : p.inStock ? 'stock' : 'out';

const AVAILABILITY_LABELS: ReadonlyArray<readonly [Exclude<Availability, 'all'>, string, string]> = [
  ['stock', 'En stock', 'bi-check2-circle'],
  ['preorder', 'Sur réservation', 'bi-calendar-event'],
  ['out', 'Rupture de stock', 'bi-x-circle'],
];

// Catalogue au style ShopWise : barre latérale de widgets (comme le blog ShopWise), barre d'outils
// (résultats, tri, vue grille/liste), cartes produit ShopWise et pagination.
function ProductsContent({ initialProducts }: ProductsClientProps) {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('categorie');
  const query = (searchParams.get('q') ?? '').trim();
  const { categories } = useCategories();
  const resultsRef = useRef<HTMLDivElement>(null);

  const priceMax = useMemo(() => {
    const max = initialProducts.reduce((m, p) => Math.max(m, p.price), 0);
    return Math.max(1000, Math.ceil(max / 1000) * 1000);
  }, [initialProducts]);

  const [selectedCategory, setSelectedCategory] = useState<string>(categoryParam || 'all');
  const [search, setSearch] = useState(query);
  const [priceCap, setPriceCap] = useState<number | null>(null);
  const [availability, setAvailability] = useState<Availability>('all');
  const [unit, setUnit] = useState<string>('all');
  const [tag, setTag] = useState<ProductBadge | null>(null);
  const [sort, setSort] = useState<SortKey>('default');
  const [view, setView] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSelectedCategory(categoryParam || 'all');
  }, [categoryParam]);

  useEffect(() => {
    setSearch(query);
  }, [query]);

  const cap = priceCap ?? priceMax;

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = initialProducts.filter((p) => {
      const inCategory = selectedCategory === 'all' || normalize(p.category) === normalize(selectedCategory);
      const matchesQuery =
        !needle || `${p.name} ${p.shortDescription} ${p.description}`.toLowerCase().includes(needle);
      return (
        inCategory &&
        matchesQuery &&
        p.price <= cap &&
        (availability === 'all' || availabilityOf(p) === availability) &&
        (unit === 'all' || p.unit === unit) &&
        (!tag || p.badges.includes(tag))
      );
    });

    const byBadge = (badge: ProductBadge) => (a: Product, b: Product) =>
      Number(b.badges.includes(badge)) - Number(a.badges.includes(badge));
    switch (sort) {
      case 'popularity':
        return [...list].sort(byBadge('populaire'));
      case 'newness':
        return [...list].sort(
          (a, b) => Number(b.badges.includes('nouveau')) - Number(a.badges.includes('nouveau')) ||
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      case 'rating':
        return [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
      case 'price-asc':
        return [...list].sort((a, b) => a.price - b.price);
      case 'price-desc':
        return [...list].sort((a, b) => b.price - a.price);
      default:
        return list;
    }
  }, [initialProducts, selectedCategory, search, cap, availability, unit, tag, sort]);

  // Tout changement de filtre ramène à la première page
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, search, cap, availability, unit, tag, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const goToPage = (n: number) => {
    setPage(Math.min(pageCount, Math.max(1, n)));
    resultsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    initialProducts.forEach((p) => {
      const slug = normalize(p.category);
      counts[slug] = (counts[slug] || 0) + 1;
    });
    return counts;
  }, [initialProducts]);

  const availabilityCounts = useMemo(() => {
    const counts = { stock: 0, preorder: 0, out: 0 };
    initialProducts.forEach((p) => {
      counts[availabilityOf(p)] += 1;
    });
    return counts;
  }, [initialProducts]);

  const units = useMemo(() => {
    const map = new Map<string, number>();
    initialProducts.forEach((p) => map.set(p.unit, (map.get(p.unit) ?? 0) + 1));
    return Array.from(map.entries());
  }, [initialProducts]);

  const tags = useMemo(() => {
    const set = new Set<ProductBadge>();
    initialProducts.forEach((p) => p.badges.forEach((b) => set.add(b)));
    return Array.from(set);
  }, [initialProducts]);

  // « Produits en vedette » : populaires / nouveaux d'abord, avec photo
  const featured = useMemo(() => {
    const score = (p: Product) =>
      Number(p.badges.includes('populaire')) * 2 + Number(p.badges.includes('nouveau')) + Number(p.images.length > 0) * 3;
    return [...initialProducts].sort((a, b) => score(b) - score(a)).slice(0, 3);
  }, [initialProducts]);

  const activeCategories = categories.filter((c) => c.isActive);
  const selectedName =
    selectedCategory === 'all' ? null : activeCategories.find((c) => c.slug === selectedCategory)?.name;
  const hasFilters =
    selectedCategory !== 'all' || search.trim() !== '' || priceCap !== null || availability !== 'all' || unit !== 'all' || tag !== null;

  const resetFilters = () => {
    setSelectedCategory('all');
    setSearch('');
    setPriceCap(null);
    setAvailability('all');
    setUnit('all');
    setTag(null);
  };

  // Filtres actifs affichés en étiquettes supprimables au-dessus des résultats
  const activeChips: Array<{ label: string; clear: () => void }> = [
    ...(selectedName ? [{ label: selectedName, clear: () => setSelectedCategory('all') }] : []),
    ...(search.trim() ? [{ label: `« ${search.trim()} »`, clear: () => setSearch('') }] : []),
    ...(priceCap !== null ? [{ label: `≤ ${formatPrice(priceCap)}`, clear: () => setPriceCap(null) }] : []),
    ...(availability !== 'all'
      ? [{ label: AVAILABILITY_LABELS.find(([k]) => k === availability)![1], clear: () => setAvailability('all') }]
      : []),
    ...(unit !== 'all' ? [{ label: `Par ${unitLabel(unit)}`, clear: () => setUnit('all') }] : []),
    ...(tag ? [{ label: getBadgeLabel(tag), clear: () => setTag(null) }] : []),
  ];

  return (
    <>
      <PageHeader
        title={selectedName ?? 'Nos produits'}
        crumbs={selectedName ? [{ label: 'Produits', href: '/produits' }, { label: selectedName }] : [{ label: 'Produits' }]}
      />

      <section className="sw-section sw-shop">
        <div className="container">
          <div className="row g-4">
            {/* Barre latérale */}
            <aside className="col-lg-3" aria-label="Filtres">
              <div className="shop-widget">
                <h4>Rechercher</h4>
                <form role="search" className="shop-search" onSubmit={(e) => e.preventDefault()}>
                  <input
                    type="search"
                    className="form-control"
                    placeholder="Nom, usage, référence…"
                    aria-label="Rechercher un produit"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <i className="bi bi-search" aria-hidden="true"></i>
                </form>
              </div>

              <div className="shop-widget">
                <h4>Catégories</h4>
                <ul className="shop-filter-list">
                  <li>
                    <Link
                      href="/produits"
                      className={selectedCategory === 'all' ? 'active' : undefined}
                      aria-current={selectedCategory === 'all' ? 'true' : undefined}
                      onClick={() => setSelectedCategory('all')}
                    >
                      <span>Tous les produits</span>
                      <span className="count">{initialProducts.length}</span>
                    </Link>
                  </li>
                  {activeCategories.map((category) => (
                    <li key={category.id}>
                      <Link
                        href={`/produits?categorie=${category.slug}`}
                        className={selectedCategory === category.slug ? 'active' : undefined}
                        aria-current={selectedCategory === category.slug ? 'true' : undefined}
                        onClick={() => setSelectedCategory(category.slug)}
                      >
                        <span>{category.name}</span>
                        <span className="count">{categoryCounts[category.slug] || 0}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shop-widget">
                <h4>Prix</h4>
                <input
                  type="range"
                  className="form-range"
                  id="rangeInput"
                  min={0}
                  max={priceMax}
                  step={1000}
                  value={cap}
                  aria-label="Prix maximum"
                  onChange={(e) => setPriceCap(Number(e.target.value) >= priceMax ? null : Number(e.target.value))}
                />
                <div className="shop-price-range">
                  <span>0 Ar</span>
                  <output htmlFor="rangeInput">Jusqu&apos;à {formatPrice(cap)}</output>
                </div>
              </div>

              <div className="shop-widget">
                <h4>Disponibilité</h4>
                <ul className="shop-filter-list">
                  {AVAILABILITY_LABELS.filter(([key]) => availabilityCounts[key] > 0).map(([key, label, icon]) => (
                    <li key={key}>
                      <button
                        type="button"
                        className={availability === key ? 'active' : undefined}
                        aria-pressed={availability === key}
                        onClick={() => setAvailability(availability === key ? 'all' : key)}
                      >
                        <span><i className={`bi ${icon}`}></i>{label}</span>
                        <span className="count">{availabilityCounts[key]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shop-widget">
                <h4>Vendu par</h4>
                <div className="shop-radios">
                  <div className="form-check">
                    <input
                      type="radio"
                      className="form-check-input"
                      id="unit-all"
                      name="unit"
                      checked={unit === 'all'}
                      onChange={() => setUnit('all')}
                    />
                    <label htmlFor="unit-all" className="form-check-label">Toutes les unités</label>
                  </div>
                  {units.map(([value, count]) => (
                    <div key={value} className="form-check">
                      <input
                        type="radio"
                        className="form-check-input"
                        id={`unit-${value}`}
                        name="unit"
                        checked={unit === value}
                        onChange={() => setUnit(value)}
                      />
                      <label htmlFor={`unit-${value}`} className="form-check-label">
                        {unitLabel(value)} ({count})
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {tags.length > 0 && (
                <div className="shop-widget">
                  <h4>Étiquettes</h4>
                  <div className="shop-tags">
                    {tags.map((badge) => (
                      <button
                        key={badge}
                        type="button"
                        className={tag === badge ? 'active' : undefined}
                        aria-pressed={tag === badge}
                        onClick={() => setTag(tag === badge ? null : badge)}
                      >
                        {getBadgeLabel(badge)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="shop-widget shop-cta">
                <span className="sw-pill">Pro</span>
                <h4>Tarifs dégressifs par quantité</h4>
                <p>Créez un compte professionnel pour accéder aux prix de gros et aux paliers de quantité.</p>
                <Link href="/inscription" className="sw-btn-primary">
                  Créer un compte pro <i className="bi bi-arrow-right"></i>
                </Link>
              </div>

              <div className="shop-widget">
                <h4>Produits en vedette</h4>
                <div className="shop-featured">
                  {featured.map((product) => (
                    <Link key={product.id} href={`/produits/${product.slug}`} className="shop-featured-item">
                      <Image src={getProductImage(product)} alt="" width={64} height={64} />
                      <span>
                        <strong>{product.name}</strong>
                        <small>
                          {formatPrice(product.price)}
                          {product.originalPrice && <s>{formatPrice(product.originalPrice)}</s>}
                        </small>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </aside>

            {/* Résultats */}
            <div className="col-lg-9" ref={resultsRef} style={{ scrollMarginTop: 90 }}>
              <div className="shop-toolbar">
                <p className="mb-0" role="status">
                  <strong>{filteredProducts.length}</strong> produit{filteredProducts.length > 1 ? 's' : ''}
                  {search.trim() && <> pour «&nbsp;{search.trim()}&nbsp;»</>}
                </p>
                <div className="shop-toolbar-actions">
                  <label htmlFor="sort-by" className="visually-hidden">Trier par :</label>
                  <select
                    id="sort-by"
                    className="form-select form-select-sm"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                  >
                    <option value="default">Tri par défaut</option>
                    <option value="popularity">Popularité</option>
                    <option value="newness">Nouveautés</option>
                    <option value="rating">Note moyenne</option>
                    <option value="price-asc">Prix croissant</option>
                    <option value="price-desc">Prix décroissant</option>
                  </select>
                  <div className="shop-view" role="tablist" aria-label="Affichage">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === 'grid'}
                      aria-label="Vue grille"
                      className={view === 'grid' ? 'active' : undefined}
                      onClick={() => setView('grid')}
                    >
                      <i className="bi bi-grid-3x3-gap"></i>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === 'list'}
                      aria-label="Vue liste"
                      className={view === 'list' ? 'active' : undefined}
                      onClick={() => setView('list')}
                    >
                      <i className="bi bi-list-ul"></i>
                    </button>
                  </div>
                </div>
              </div>

              {hasFilters && (
                <div className="shop-chips">
                  {activeChips.map((chip) => (
                    <button key={chip.label} type="button" onClick={chip.clear} aria-label={`Retirer le filtre ${chip.label}`}>
                      {chip.label} <i className="bi bi-x"></i>
                    </button>
                  ))}
                  <button type="button" className="reset" onClick={resetFilters}>
                    <i className="bi bi-arrow-counterclockwise"></i> Réinitialiser les filtres
                  </button>
                </div>
              )}

              {pageProducts.length === 0 ? (
                <div className="sw-empty">
                  <i className="bi bi-search"></i>
                  <h2>Aucun produit trouvé</h2>
                  <p>Aucun produit ne correspond à votre recherche. Essayez d&apos;élargir vos filtres.</p>
                  {hasFilters && (
                    <button type="button" className="sw-btn-primary" onClick={resetFilters}>
                      Voir tout le catalogue
                    </button>
                  )}
                </div>
              ) : (
                <div className={`row g-3 shop-results${view === 'list' ? ' shop-list' : ''}`}>
                  {pageProducts.map((product, index) => (
                    <div key={product.id} className={view === 'list' ? 'col-12' : 'col-md-6 col-xl-4'}>
                      <ProductCard product={product} index={index} />
                    </div>
                  ))}
                </div>
              )}

              {pageCount > 1 && (
                <nav aria-label="Pagination" className="shop-pagination">
                  <button
                    type="button"
                    aria-label="Page précédente"
                    disabled={currentPage === 1}
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    <i className="bi bi-chevron-left"></i>
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={n === currentPage ? 'active' : undefined}
                      aria-current={n === currentPage ? 'page' : undefined}
                      onClick={() => goToPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Page suivante"
                    disabled={currentPage === pageCount}
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    <i className="bi bi-chevron-right"></i>
                  </button>
                </nav>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function ProductsClient({ initialProducts }: ProductsClientProps) {
  return (
    <Suspense fallback={<div className="container py-5 text-center">Chargement…</div>}>
      <ProductsContent initialProducts={initialProducts} />
    </Suspense>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useCategories } from '@/hooks/useCategories';
import { useCompanyAccess } from '@/hooks/useCompanyAccess';
import { formatPrice, resolveUnitPrice } from '@/lib/utils';

const NAV = [
  { name: 'Accueil', href: '/' },
  { name: 'Produits', href: '/produits' },
  { name: 'Vendeurs', href: '/vendeurs' },
  { name: 'Services', href: '/services' },
  { name: 'Blog', href: '/blog' },
];

type Flyout = 'account' | 'cart' | null;

// En-tête du template ShopWise : barre utilitaire, logo + recherche + actions (compte, favoris,
// mini-panier), barre de navigation avec mégamenu des catégories.
export function ShopwiseHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const cart = useCart();
  const wishlist = useWishlist();
  const { data: session, status } = useSession();
  const { isApproved, isCustomer } = useCompanyAccess();
  const { categories } = useCategories();
  const [query, setQuery] = useState('');
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  const activeCategories = categories.filter((c) => c.isActive);
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const lineTotal = (item: (typeof cart.items)[number]) =>
    (isApproved ? resolveUnitPrice(item.price, item.priceTiers, item.quantity) : item.price) * item.quantity;
  const cartTotal = cart.items.reduce((sum, item) => sum + lineTotal(item), 0);

  // Ferme les menus à chaque changement de page
  useEffect(() => {
    setFlyout(null);
    setNavOpen(false);
    setMegaOpen(false);
  }, [pathname]);

  // Ferme les menus déroulants au clic à l'extérieur ou avec Échap
  useEffect(() => {
    if (!flyout) return;
    const onClick = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setFlyout(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFlyout(null);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [flyout]);

  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [navOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/produits?q=${encodeURIComponent(q)}` : '/produits');
  };

  const toggle = (name: Exclude<Flyout, null>) => setFlyout((f) => (f === name ? null : name));
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const accountLabel = isCustomer ? 'Compte particulier' : isApproved ? 'Compte professionnel' : 'En attente de validation';
  const displayName = session?.user?.companyName || session?.user?.name;

  const searchForm = (
    <form className="sw-search" role="search" onSubmit={handleSearch}>
      <i className="bi bi-search sw-search-icon" aria-hidden="true"></i>
      <input
        type="search"
        placeholder="Rechercher des produits, des marques et plus…"
        aria-label="Rechercher un produit"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="submit">Rechercher</button>
    </form>
  );

  return (
    <header className="sw-header">
      {/* Barre utilitaire */}
      <div className="sw-utility">
        <div className="container-fluid container-xl">
          <div className="sw-utility-links">
            <Link href="/suivi-commande" className="sw-utility-link">
              <i className="bi bi-box-seam"></i>
              <span>Suivi de commande</span>
            </Link>
            <span className="sw-utility-divider"></span>
            <Link href="/contact" className="sw-utility-link">
              <i className="bi bi-headset"></i>
              <span>Support</span>
            </Link>
          </div>
          <span className="sw-promo-text">Tarifs dégressifs pour les professionnels · Paiement Mobile Money</span>
        </div>
      </div>

      {/* Logo, recherche, actions */}
      <div className="sw-mainbar">
        <div className="container-fluid container-xl">
          <Link href="/" className="sw-logo" aria-label="Tsena Pro - Accueil">
            <i className="bi bi-cart2"></i>
            <span>Tsena Pro</span>
          </Link>

          {searchForm}

          <div className="sw-actions" ref={actionsRef}>
            {/* Compte */}
            <div className="sw-flyout-wrap">
              <button
                type="button"
                className="sw-action-btn"
                aria-label="Mon compte"
                aria-expanded={flyout === 'account'}
                onClick={() => toggle('account')}
              >
                <i className="bi bi-person-circle"></i>
              </button>
              {flyout === 'account' && (
                <div className="sw-flyout sw-account-flyout">
                  {session ? (
                    <>
                      <div className="sw-flyout-header">
                        <h6>{displayName || 'Mon compte'}</h6>
                        <p>{session.user?.email}</p>
                      </div>
                      {session.user?.role !== 'platform_admin' && <span className="sw-flyout-status">{accountLabel}</span>}
                      <div className="sw-flyout-links">
                        <Link href="/compte"><i className="bi bi-person"></i><span>Mon compte</span></Link>
                        <Link href="/compte#orders"><i className="bi bi-receipt"></i><span>Mes commandes</span></Link>
                        <Link href="/compte#wishlist"><i className="bi bi-bookmark-heart"></i><span>Mes favoris</span></Link>
                        {session.user?.companyStatus === 'approved' && session.user?.role !== 'platform_admin' && (
                          <Link href="/vendeur"><i className="bi bi-shop"></i><span>Espace vendeur</span></Link>
                        )}
                        {session.user?.role === 'platform_admin' && (
                          <Link href="/admin"><i className="bi bi-speedometer2"></i><span>Dashboard Admin</span></Link>
                        )}
                        <button type="button" onClick={() => signOut()}>
                          <i className="bi bi-box-arrow-right"></i><span>Se déconnecter</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="sw-flyout-header">
                        <h6>Bienvenue</h6>
                        <p>Connectez-vous pour accéder à vos tarifs et commandes</p>
                      </div>
                      {status !== 'loading' && (
                        <div className="sw-flyout-actions">
                          <Link href="/connexion" className="sw-btn-solid">Connexion</Link>
                          <Link href="/inscription" className="sw-btn-outline">Inscription</Link>
                        </div>
                      )}
                      <div className="sw-flyout-links">
                        <Link href="/suivi-commande"><i className="bi bi-receipt"></i><span>Suivi de commande</span></Link>
                        <Link href="/favoris"><i className="bi bi-bookmark-heart"></i><span>Mes favoris</span></Link>
                        <Link href="/services#livraison"><i className="bi bi-truck"></i><span>Livraison</span></Link>
                        <Link href="/contact"><i className="bi bi-life-preserver"></i><span>Centre d&apos;aide</span></Link>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Favoris */}
            <Link
              href="/favoris"
              className="sw-action-btn"
              aria-label={`Mes favoris, ${wishlist.count} produit${wishlist.count > 1 ? 's' : ''}`}
            >
              <i className="bi bi-heart"></i>
              {wishlist.count > 0 && <span className="sw-badge-count">{wishlist.count}</span>}
            </Link>

            {/* Mini-panier */}
            <div className="sw-flyout-wrap">
              <button
                type="button"
                className="sw-action-btn"
                aria-label={`Panier, ${itemCount} article${itemCount > 1 ? 's' : ''}`}
                aria-expanded={flyout === 'cart'}
                onClick={() => toggle('cart')}
              >
                <i className="bi bi-bag"></i>
                {itemCount > 0 && <span className="sw-badge-count">{itemCount > 99 ? '99+' : itemCount}</span>}
              </button>
              {flyout === 'cart' && (
                <div className="sw-flyout sw-cart-flyout">
                  <div className="sw-flyout-top">
                    <h6>Votre panier</h6>
                    <span className="sw-items-label">
                      {itemCount} article{itemCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  {cart.items.length === 0 ? (
                    <div className="sw-cart-empty">
                      <i className="bi bi-bag-x"></i>
                      Votre panier est vide
                    </div>
                  ) : (
                    <>
                      <div className="sw-flyout-items">
                        {cart.items.map((item) => (
                          <div key={item.productId} className="sw-flyout-item">
                            <div className="sw-flyout-thumb">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.image} alt={item.name} />
                            </div>
                            <div className="sw-flyout-details">
                              <h6>
                                <Link href={`/produits/${item.slug}`} className="text-reset">{item.name}</Link>
                              </h6>
                              {item.sellerName && <span className="sw-item-option">Vendu par {item.sellerName}</span>}
                              <div className="sw-item-bottom">
                                <span className="sw-item-price">{formatPrice(lineTotal(item))}</span>
                                <span className="sw-item-qty">
                                  x{item.quantity}
                                  {item.unit ? ` ${item.unit}` : ''}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="sw-item-dismiss"
                              aria-label={`Retirer ${item.name}`}
                              onClick={() => cart.removeItem(item.productId)}
                            >
                              <i className="bi bi-trash3"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="sw-flyout-bottom">
                        <div className="sw-subtotal-row">
                          <span>Sous-total</span>
                          <span className="sw-subtotal-value">{formatPrice(cartTotal)}</span>
                        </div>
                        <Link href="/checkout" className="sw-btn-proceed">Passer la commande</Link>
                        <Link href="/panier" className="sw-link-viewbag">Voir le panier complet →</Link>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="sw-action-btn sw-mobile-toggle"
              aria-label="Ouvrir le menu"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <i className="bi bi-list" style={{ fontSize: 26 }}></i>
            </button>
          </div>
        </div>
      </div>

      {/* Recherche mobile */}
      <div className="sw-mobile-search">
        <div className="container-fluid container-xl">{searchForm}</div>
      </div>

      {/* Navigation */}
      <div
        className={`sw-navstrip${navOpen ? ' open' : ''}`}
        onClick={(e) => e.target === e.currentTarget && setNavOpen(false)}
      >
        {navOpen && (
          <button type="button" className="sw-nav-close" aria-label="Fermer le menu" onClick={() => setNavOpen(false)}>
            <i className="bi bi-x"></i>
          </button>
        )}
        <div className="container-fluid container-xl">
          <nav className="sw-nav" aria-label="Navigation principale">
            <ul>
              {NAV.slice(0, 2).map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={isActive(item.href) ? 'active' : undefined}>{item.name}</Link>
                </li>
              ))}

              {/* Mégamenu des catégories */}
              <li className={`sw-has-mega${megaOpen ? ' open' : ''}`}>
                <button type="button" aria-expanded={megaOpen} onClick={() => setMegaOpen((o) => !o)}>
                  <span>Catégories</span> <i className="bi bi-chevron-down"></i>
                </button>
                <div className="sw-megamenu">
                  <div className="sw-mega-tabs">
                    <button type="button" className="active">Toutes les catégories</button>
                  </div>
                  <div className="sw-mega-cats">
                    <div className="sw-mega-cat">
                      <h4>Catalogue</h4>
                      <ul>
                        <li><Link href="/produits">Tous les produits</Link></li>
                        <li><Link href="/favoris">Mes favoris</Link></li>
                        <li><Link href="/vendeurs">Nos vendeurs</Link></li>
                      </ul>
                    </div>
                    <div className="sw-mega-cat" style={{ gridColumn: 'span 2' }}>
                      <h4>Rayons</h4>
                      <ul style={{ columns: 2 }}>
                        {activeCategories.map((c) => (
                          <li key={c.id}>
                            <Link href={`/produits?categorie=${c.slug}`}>{c.name}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="sw-mega-cat">
                      <h4>Professionnels</h4>
                      <ul>
                        <li><Link href="/inscription">Créer un compte pro</Link></li>
                        <li><Link href="/vendeur">Espace vendeur</Link></li>
                        <li><Link href="/services#paiement">Paiement Mobile Money</Link></li>
                      </ul>
                    </div>
                  </div>
                </div>
              </li>

              {NAV.slice(2).map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={isActive(item.href) ? 'active' : undefined}>{item.name}</Link>
                </li>
              ))}
              <li>
                <Link href="/contact" className={isActive('/contact') ? 'active' : undefined}>Contact</Link>
              </li>
            </ul>
          </nav>
          <Link href="/inscription" className="sw-nav-cta">
            <i className="bi bi-building"></i> Devenir client pro
          </Link>
        </div>
      </div>
    </header>
  );
}

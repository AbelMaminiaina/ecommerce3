'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import type { CompanyOrder, Product } from '@/types';
import { PageHeader } from '@/components/shop/PageHeader';
import { PaymentPanel } from '@/components/shop/PaymentPanel';
import { useProductActions } from '@/components/shop/useProductActions';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useCompanyAccess } from '@/hooks/useCompanyAccess';
import { getMyOrders } from '@/lib/api/checkout';
import { getProducts } from '@/lib/api/products';
import { PAYMENT_STATUS_LABELS } from '@/lib/api/payments';
import { formatPrice, getProductImage } from '@/lib/utils';
import { CONTACT, CONTACT_MAILTO } from '@/lib/contact';

type Panel = 'dashboard' | 'orders' | 'wishlist' | 'profile';
const PANELS: Panel[] = ['dashboard', 'orders', 'wishlist', 'profile'];

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de paiement',
  confirmed: 'Confirmée',
  processing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

const DELIVERY_LABELS: Record<string, string> = {
  standard: 'Livraison standard',
  express: 'Livraison express',
  retrait: 'Retrait sur place',
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  customer: 'Particulier',
  company_admin: 'Professionnel (administrateur)',
  buyer: 'Professionnel (acheteur)',
  platform_admin: 'Administrateur de la plateforme',
};

const COMPANY_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de validation',
  approved: 'Approuvé',
  rejected: 'Refusé',
  suspended: 'Suspendu',
};

const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function isReservation(availableFrom?: string | null): boolean {
  if (!availableFrom) return false;
  const d = new Date(availableFrom);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

// Une commande, présentée comme dans account.html (en-tête, lignes) + détail dépliable (livraison, totaux, paiement)
function OrderItem({ order, token }: { order: CompanyOrder; token?: string }) {
  const [open, setOpen] = useState(false);
  const paymentStatus = order.paymentStatus ?? 'awaiting';
  const needsPayment = order.status !== 'cancelled' && paymentStatus !== 'paid';

  return (
    <div className="order-item">
      <div className="order-head">
        <div><span>Commande</span><strong>{order.orderNumber}</strong></div>
        <div><span>Date</span><strong>{dateFr(order.createdAt)}</strong></div>
        <div><span>Total</span><strong>{formatPrice(order.total)}</strong></div>
        <span className={`order-status st-${order.status}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <div className="order-lines">
        {order.items.map((item, i) => (
          <div key={i} className="order-line">
            <span className="line-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {item.image && <img src={item.image} alt={item.name} />}
            </span>
            <div className="line-name">
              <strong>
                {item.slug ? <Link href={`/produits/${item.slug}`} className="text-reset">{item.name}</Link> : item.name}
              </strong>
              <small>
                Qté {item.quantity}
                {isReservation(item.availableFrom) && ` · Réservation, livraison à partir du ${dateFr(item.availableFrom!)}`}
              </small>
            </div>
            <span className="line-price">{formatPrice(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>
      <div className="order-foot">
        <span>
          <i className="bi bi-truck me-1"></i>
          {DELIVERY_LABELS[order.deliveryMethod] ?? order.deliveryMethod}
          {needsPayment && <span className="order-pay-badge ms-2">{PAYMENT_STATUS_LABELS[paymentStatus]}</span>}
        </span>
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Masquer le détail' : needsPayment ? 'Détail et paiement' : 'Voir le détail'}{' '}
          <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
        </button>
      </div>
      {open && (
        <div className="order-detail">
          {order.address && (
            <p className="mb-2">
              <i className="bi bi-geo-alt me-1"></i>
              {order.address.street}, {order.address.postalCode} {order.address.city}
            </p>
          )}
          {order.cancelReason && <p className="text-danger mb-2">Motif d&apos;annulation : {order.cancelReason}</p>}
          <div className="totals mb-3">
            <div><span>Sous-total</span><span>{formatPrice(order.subtotal)}</span></div>
            <div><span>Livraison</span><span>{order.shippingCost > 0 ? formatPrice(order.shippingCost) : 'Gratuite'}</span></div>
            <div className="grand"><span>Total</span><span>{formatPrice(order.total)}</span></div>
          </div>
          {order.status !== 'cancelled' && <PaymentPanel orderNumber={order.orderNumber} token={token} />}
        </div>
      )}
    </div>
  );
}

function WishCard({ product }: { product: Product }) {
  const { unitPrice, addToCart, toggleWishlist, buttonLabel, unavailable, canOrder } = useProductActions(product);
  return (
    <div className="col-sm-6 col-xl-4">
      <div className="wish-card">
        <Link href={`/produits/${product.slug}`} className="wish-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={getProductImage(product)} alt={product.name} />
        </Link>
        <div className="wish-card-body">
          <h5><Link href={`/produits/${product.slug}`}>{product.name}</Link></h5>
          <span className="price">{formatPrice(unitPrice)}</span>
          <div className="wish-card-actions">
            <button type="button" className="btn-submit" disabled={unavailable || !canOrder} onClick={addToCart}>
              <i className="bi bi-bag-plus me-1"></i> {buttonLabel}
            </button>
            <button type="button" className="btn-icon" aria-label="Retirer des favoris" onClick={toggleWishlist}>
              <i className="bi bi-heart-fill"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Espace client du template ShopWise (account.html) : menu latéral + tableau de bord, commandes, favoris, profil.
export default function AccountPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { canOrder } = useCompanyAccess();
  const cart = useCart();
  const wishlist = useWishlist();
  const [panel, setPanel] = useState<Panel>('dashboard');
  const [orders, setOrders] = useState<CompanyOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);

  // Onglet synchronisé avec l'ancre (/compte#orders, #wishlist…), comme dans le template
  useEffect(() => {
    const fromHash = () => {
      const name = window.location.hash.slice(1) as Panel;
      setPanel(PANELS.includes(name) ? name : 'dashboard');
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/connexion?callbackUrl=/compte');
  }, [status, router]);

  const token = session?.accessToken;
  useEffect(() => {
    if (!token) return;
    if (!canOrder) {
      setOrders([]);
      setOrdersError('Votre compte professionnel doit être validé par notre équipe avant de pouvoir commander.');
      return;
    }
    getMyOrders(token)
      .then((res) => setOrders(res.orders ?? []))
      .catch(() => {
        setOrders([]);
        setOrdersError('Impossible de charger vos commandes pour le moment.');
      });
  }, [token, canOrder]);

  useEffect(() => {
    getProducts()
      .then((res) => setProducts(res.products))
      .catch(() => setProducts([]));
  }, []);

  const goTo = useCallback((name: Panel) => {
    window.history.replaceState(null, '', name === 'dashboard' ? '/compte' : `#${name}`);
    setPanel(name);
    if (window.innerWidth < 992) document.querySelector('#account .col-lg-9')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  if (status !== 'authenticated' || !session) {
    return (
      <>
        <PageHeader title="Mon compte" crumbs={[{ label: 'Mon compte' }]} />
        <section className="sw-section account">
          <div className="container text-center">
            <span className="spinner-border text-primary" role="status" aria-label="Chargement"></span>
          </div>
        </section>
      </>
    );
  }

  const user = session.user;
  const fullName = user?.name || user?.email || 'Mon compte';
  const firstName = (user?.name || '').split(' ')[0];
  const initials = (user?.name || user?.email || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const favorites = (products ?? []).filter((p) => wishlist.ids.includes(p.id));
  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const orderCount = orders?.length ?? 0;

  const emptyOrders = (
    <div className="empty-state">
      <i className="bi bi-box-seam"></i>
      <p>{ordersError ?? "Vous n'avez pas encore passé de commande."}</p>
      <Link href="/produits" className="btn-submit">Découvrir nos produits</Link>
    </div>
  );
  const renderOrders = (list: CompanyOrder[]) =>
    orders === null ? (
      <div className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary" aria-label="Chargement"></span></div>
    ) : list.length ? (
      list.map((order) => <OrderItem key={order.id} order={order} token={token} />)
    ) : (
      emptyOrders
    );

  const navButton = (name: Panel, icon: string, label: string, count?: number) => (
    <button
      type="button"
      className={`account-nav-link${panel === name ? ' active' : ''}`}
      role="tab"
      aria-selected={panel === name}
      onClick={() => goTo(name)}
    >
      <i className={`bi ${icon}`}></i>
      <span>{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );

  return (
    <>
      <PageHeader title="Mon compte" crumbs={[{ label: 'Mon compte' }]} />

      <section id="account" className="sw-section account">
        <div className="container">
          <div className="row g-4">

            {/* Menu du compte */}
            <div className="col-lg-3">
              <aside className="account-sidebar">
                <div className="account-user">
                  <div className="account-avatar">{initials}</div>
                  <div className="account-user-info">
                    <strong>{fullName}</strong>
                    <span>{user?.email}</span>
                  </div>
                </div>
                <nav className="account-nav" role="tablist" aria-label="Sections du compte">
                  {navButton('dashboard', 'bi-grid', 'Tableau de bord')}
                  {navButton('orders', 'bi-receipt', 'Mes commandes', orderCount)}
                  {navButton('wishlist', 'bi-heart', 'Mes favoris', wishlist.count)}
                  {navButton('profile', 'bi-person-gear', 'Profil')}
                  <button type="button" className="account-nav-link logout" onClick={() => signOut({ callbackUrl: '/' })}>
                    <i className="bi bi-box-arrow-right"></i><span>Se déconnecter</span>
                  </button>
                </nav>
              </aside>
            </div>

            {/* Contenu */}
            <div className="col-lg-9">

              {/* Tableau de bord */}
              <div className={`account-panel${panel === 'dashboard' ? ' active' : ''}`} role="tabpanel">
                <div className="panel-card welcome-card">
                  <h3>{firstName ? `Bonjour, ${firstName} !` : 'Bonjour !'}</h3>
                  <p>Depuis votre espace client, suivez vos commandes et leur paiement, gérez vos favoris et consultez les informations de votre compte.</p>
                </div>
                <div className="row g-3 my-1">
                  <div className="col-md-4">
                    <button type="button" className="stat-card" onClick={() => goTo('orders')}>
                      <span className="stat-icon"><i className="bi bi-box-seam"></i></span>
                      <span className="stat-value">{orderCount}</span>
                      <span className="stat-label">Commandes</span>
                    </button>
                  </div>
                  <div className="col-md-4">
                    <button type="button" className="stat-card" onClick={() => goTo('wishlist')}>
                      <span className="stat-icon"><i className="bi bi-heart"></i></span>
                      <span className="stat-value">{wishlist.count}</span>
                      <span className="stat-label">Favoris</span>
                    </button>
                  </div>
                  <div className="col-md-4">
                    <Link href="/panier" className="stat-card">
                      <span className="stat-icon"><i className="bi bi-bag"></i></span>
                      <span className="stat-value">{cartCount}</span>
                      <span className="stat-label">Articles au panier</span>
                    </Link>
                  </div>
                </div>
                <div className="panel-card">
                  <div className="panel-card-head">
                    <h4>Dernières commandes</h4>
                    <button type="button" className="link-btn" onClick={() => goTo('orders')}>
                      Tout voir <i className="bi bi-arrow-right"></i>
                    </button>
                  </div>
                  {renderOrders((orders ?? []).slice(0, 2))}
                </div>
              </div>

              {/* Commandes */}
              <div className={`account-panel${panel === 'orders' ? ' active' : ''}`} role="tabpanel">
                <div className="panel-card">
                  <div className="panel-card-head">
                    <h4>Mes commandes</h4>
                  </div>
                  {renderOrders(orders ?? [])}
                </div>
              </div>

              {/* Favoris */}
              <div className={`account-panel${panel === 'wishlist' ? ' active' : ''}`} role="tabpanel">
                <div className="panel-card">
                  <div className="panel-card-head">
                    <h4>Mes favoris</h4>
                  </div>
                  <div className="row g-3">
                    {products === null || !wishlist.isHydrated ? (
                      <div className="col-12 text-center py-4">
                        <span className="spinner-border spinner-border-sm text-primary" aria-label="Chargement"></span>
                      </div>
                    ) : favorites.length ? (
                      favorites.map((product) => <WishCard key={product.id} product={product} />)
                    ) : (
                      <div className="col-12">
                        <div className="empty-state">
                          <i className="bi bi-heart"></i>
                          <p>Aucun favori pour le moment. Cliquez sur le cœur d&apos;un produit pour l&apos;enregistrer ici.</p>
                          <Link href="/produits" className="btn-submit">Parcourir la boutique</Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Profil */}
              <div className={`account-panel${panel === 'profile' ? ' active' : ''}`} role="tabpanel">
                <div className="panel-card">
                  <div className="panel-card-head">
                    <h4>Informations personnelles</h4>
                  </div>
                  <dl className="profile-list">
                    <div><dt>Nom</dt><dd>{user?.name || '—'}</dd></div>
                    <div><dt>Adresse e-mail</dt><dd>{user?.email || '—'}</dd></div>
                    <div><dt>Type de compte</dt><dd>{ACCOUNT_TYPE_LABELS[user?.role ?? ''] ?? '—'}</dd></div>
                    {user?.companyName && <div><dt>Entreprise</dt><dd>{user.companyName}</dd></div>}
                    {user?.companyStatus && user.role !== 'customer' && (
                      <div><dt>Statut du compte</dt><dd>{COMPANY_STATUS_LABELS[user.companyStatus] ?? user.companyStatus}</dd></div>
                    )}
                  </dl>
                </div>
                <div className="panel-card mt-4">
                  <div className="panel-card-head">
                    <h4>Modifier mes informations</h4>
                  </div>
                  <p className="panel-intro mb-0">
                    Pour modifier vos informations ou votre mot de passe, écrivez-nous à{' '}
                    <a href={CONTACT_MAILTO}>{CONTACT.email}</a> depuis l&apos;adresse de votre compte.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>
    </>
  );
}

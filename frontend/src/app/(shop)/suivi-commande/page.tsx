'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PageHeader } from '@/components/shop/PageHeader';
import { PaymentPanel } from '@/components/shop/PaymentPanel';
import { formatPrice } from '@/lib/utils';
import { trackGuestOrder, type GuestOrder } from '@/lib/api/checkout';

const STATUS_LABELS: Record<GuestOrder['status'], { label: string; description: string }> = {
  pending: { label: 'En attente de paiement', description: 'Votre commande démarre dès que votre paiement est confirmé.' },
  confirmed: { label: 'Confirmée', description: 'Votre commande a été confirmée.' },
  processing: { label: 'En préparation', description: 'Votre commande est en cours de préparation.' },
  shipped: { label: 'Expédiée', description: 'Votre commande est en route.' },
  delivered: { label: 'Livrée', description: 'Commande livrée avec succès.' },
  cancelled: { label: 'Annulée', description: 'Cette commande a été annulée.' },
};

const DELIVERY_LABELS: Record<string, string> = {
  standard: 'Livraison standard',
  express: 'Livraison express',
  retrait: 'Retrait sur place',
};

// Suivi de commande. Client connecté : son historique est dans « Mon compte » (/compte#orders).
// Visiteur : commande passée sans compte, retrouvée avec son numéro et l'e-mail saisi au paiement
// (mise en page des pages Connexion / Mon compte du template ShopWise).
export default function SuiviCommandePage() {
  const router = useRouter();
  const { status } = useSession();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<GuestOrder | null>(null);
  // E-mail utilisé pour la recherche (le champ peut être modifié ensuite sans relancer le paiement)
  const [searchedEmail, setSearchedEmail] = useState('');

  useEffect(() => {
    if (status === 'authenticated') router.replace('/compte#orders');
  }, [status, router]);

  // Pré-remplissage depuis le lien de la page de confirmation (?order=...&email=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preOrder = params.get('order');
    const preEmail = params.get('email');
    if (preOrder) setOrderNumber(preOrder.split(',')[0]);
    if (preEmail) setEmail(preEmail);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !email.trim()) {
      setError('Merci de saisir le numéro de commande et l’adresse e-mail utilisée à la commande.');
      return;
    }
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      setOrder(await trackGuestOrder(orderNumber.trim(), email.trim()));
      setSearchedEmail(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de retrouver la commande');
    } finally {
      setLoading(false);
    }
  };

  const orderStatus = order ? STATUS_LABELS[order.status] : null;

  return (
    <>
      <PageHeader title="Suivi de commande" crumbs={[{ label: 'Suivi de commande' }]} />

      <section className="sw-section auth account">
        <div className="container">
          <div className="row g-4 justify-content-center align-items-stretch">
            <div className="col-lg-6 col-md-9">
              <div className="auth-card">
                <div className="auth-card-header">
                  <h3>Commande passée sans compte ?</h3>
                  <p>Retrouvez-la avec son numéro et l&apos;adresse e-mail saisie à la commande.</p>
                </div>
                <form onSubmit={handleSubmit} noValidate>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" htmlFor="tr-order">Numéro de commande</label>
                      <input type="text" className="form-control" id="tr-order" placeholder="ORD-XXXXXXXX-XXXXXX" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="tr-email">Adresse e-mail</label>
                      <input type="email" className="form-control" id="tr-email" placeholder="jean@exemple.mg" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    {error && (
                      <div className="col-12">
                        <div className="alert alert-danger mb-0" role="alert">{error}</div>
                      </div>
                    )}
                    <div className="col-12">
                      <button type="submit" className="btn-submit w-100" disabled={loading}>
                        {loading && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
                        Suivre ma commande
                      </button>
                    </div>
                  </div>
                </form>

                {order && orderStatus && (
                  <div className="order-item mt-4" aria-live="polite">
                    <div className="order-head">
                      <div><span>Commande</span><strong>{order.orderNumber}</strong></div>
                      <div><span>Total</span><strong>{formatPrice(order.total)}</strong></div>
                      <span className={`order-status st-${order.status}`}>{orderStatus.label}</span>
                    </div>
                    <div className="order-lines">
                      {order.items.map((item, i) => (
                        <div key={i} className="order-line">
                          <div className="line-name">
                            <strong>{item.name}</strong>
                            <small>Qté {item.quantity}</small>
                          </div>
                          <span className="line-price">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="order-detail">
                      <p className="mb-2">{orderStatus.description}</p>
                      {order.cancelReason && <p className="text-danger mb-2">Motif : {order.cancelReason}</p>}
                      <div className="totals mb-3">
                        <div>
                          <span>Livraison ({DELIVERY_LABELS[order.deliveryMethod] ?? order.deliveryMethod})</span>
                          <span>{order.shippingCost === 0 ? 'Gratuite' : formatPrice(order.shippingCost)}</span>
                        </div>
                        <div className="grand"><span>Total</span><span>{formatPrice(order.total)}</span></div>
                      </div>
                      {order.sellerName && <p className="small mb-3">Vendu par {order.sellerName}</p>}
                      {order.status !== 'cancelled' && <PaymentPanel orderNumber={order.orderNumber} email={searchedEmail} />}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="col-lg-5 d-none d-lg-block">
              <div className="auth-aside">
                <span className="auth-aside-badge"><i className="bi bi-person-circle"></i> Déjà client ?</span>
                <h3>Retrouvez toutes vos commandes</h3>
                <ul className="auth-perks">
                  <li>
                    <i className="bi bi-receipt"></i>
                    <div><strong>Historique complet</strong><span>Toutes vos commandes et leur statut dans votre espace client.</span></div>
                  </li>
                  <li>
                    <i className="bi bi-phone"></i>
                    <div><strong>Paiement Mobile Money</strong><span>Réglez une commande en attente directement depuis votre compte.</span></div>
                  </li>
                </ul>
                <Link href="/connexion?callbackUrl=/compte%23orders" className="btn-social mt-4 text-decoration-none" style={{ maxWidth: 220 }}>
                  <i className="bi bi-box-arrow-in-right"></i> Se connecter
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatPrice, formatQuantity } from '@/lib/utils';
import { getSellerOrders, updateSellerOrderStatus, type SellerOrder } from '@/lib/api/seller';
import { PageHead } from '@/components/admin/AdminShell';

const statusLabel: Record<SellerOrder['status'], { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'tone-warning' },
  confirmed: { label: 'Confirmée', className: 'tone-info' },
  processing: { label: 'En préparation', className: 'tone-info' },
  shipped: { label: 'Expédiée', className: 'tone-accent' },
  delivered: { label: 'Livrée', className: 'tone-success' },
  cancelled: { label: 'Annulée', className: 'tone-danger' },
};

// Étape suivante du traitement d'une commande (le vendeur fait avancer ses propres commandes)
const nextStep: Partial<Record<SellerOrder['status'], { to: SellerOrder['status']; label: string }>> = {
  pending: { to: 'confirmed', label: 'Confirmer' },
  confirmed: { to: 'processing', label: 'Mettre en préparation' },
  processing: { to: 'shipped', label: 'Marquer expédiée' },
  shipped: { to: 'delivered', label: 'Marquer livrée' },
};

export default function SellerOrdersPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Suivi du colis saisi avant « Marquer expédiée » (facultatif), par commande
  const [tracking, setTracking] = useState<Record<string, { carrier: string; trackingNumber: string }>>({});
  const trackingOf = (orderId: string) => tracking[orderId] ?? { carrier: '', trackingNumber: '' };

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setOrders((await getSellerOrders(token)).orders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les commandes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const change = async (order: SellerOrder, status: SellerOrder['status'], reason?: string) => {
    if (!token) return;
    setBusy(order.id);
    try {
      const t = tracking[order.id];
      await updateSellerOrderStatus(
        order.id,
        status,
        token,
        reason,
        status === 'shipped' && t ? { carrier: t.carrier.trim() || undefined, trackingNumber: t.trackingNumber.trim() || undefined } : undefined
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible');
    } finally {
      setBusy(null);
    }
  };

  const head = (
    <PageHead
      title="Commandes reçues"
      crumbs={[{ label: 'Espace vendeur', href: '/vendeur' }, { label: 'Commandes reçues' }]}
    />
  );

  if (loading) {
    return (
      <>
        {head}
        <div className="h-40 animate-pulse rounded-xl bg-white" />
      </>
    );
  }

  return (
    <div>
      {head}
      {error && (
        <div role="alert" className="sw-alert tone-danger mb-4">
          <i className="bi bi-exclamation-circle"></i>
          <span>{error}</span>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-warm-600">
          Aucune commande reçue pour le moment.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const st = statusLabel[order.status];
            const step = nextStep[order.status];
            const closed = order.status === 'delivered' || order.status === 'cancelled';
            const paid = order.paymentStatus === 'paid';
            // Paiement à la livraison : préparée et expédiée avant d'être payée ; la plateforme la passe en
            // « livrée » quand le livreur lui remet l'argent
            const cashOnDelivery = order.paymentMethod === 'cash_on_delivery';
            const canAdvance = paid || (cashOnDelivery && order.status !== 'shipped');
            return (
              <div key={order.id} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-warm-800">{order.orderNumber}</h2>
                    <p className="text-sm text-warm-500">{new Date(order.createdAt).toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`pill ${paid ? 'tone-success' : 'tone-warning'}`}
                    >
                      {paid
                        ? 'Payée'
                        : cashOnDelivery
                          ? 'Paiement à la livraison'
                          : order.paymentStatus === 'submitted'
                            ? 'Paiement en vérification'
                            : 'Paiement en attente'}
                    </span>
                    {order.protection === 'disputed' && <span className="pill tone-danger">Litige en cours</span>}
                    {order.protection === 'received' && <span className="pill tone-success">Reçue par le client</span>}
                    {order.status === 'delivered' && order.protection === 'protected' && (
                      <span className="pill tone-info">Réception à confirmer</span>
                    )}
                    <span className={`pill ${st.className}`}>{st.label}</span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="text-sm text-warm-600">
                    <p className="font-medium text-warm-800">
                      {order.buyerName} <span className="font-normal">({order.buyerType})</span>
                    </p>
                    {order.contactEmail && <p>{order.contactEmail}</p>}
                    {order.contactPhone && <p>{order.contactPhone}</p>}
                    <p className="mt-2">
                      {order.deliveryMethod === 'retrait'
                        ? 'Retrait sur place'
                        : order.pickupPoint
                          ? `Point relais ${order.pickupPoint.name} — ${order.pickupPoint.address}, ${order.pickupPoint.city}`
                          : order.address
                            ? `${order.address.street}, ${order.address.city} ${order.address.postalCode}`
                            : 'Adresse non renseignée'}
                    </p>
                    {order.deliveryMethod === 'province' && (
                      <p className="font-medium text-warm-800">
                        Livraison en province{order.shippingZone ? ` (${order.shippingZone})` : ''} : envoi par transporteur
                      </p>
                    )}
                    {order.trackingNumber && (
                      <p>Suivi : {order.carrier ? `${order.carrier} ` : ''}{order.trackingNumber}</p>
                    )}
                    {order.notes && <p className="mt-2 italic">« {order.notes} »</p>}
                    {order.cancelReason && <p className="mt-2 text-red-600">Annulation : {order.cancelReason}</p>}
                    {order.protection === 'disputed' && order.disputeReason && (
                      <p className="mt-2 text-red-600">Problème signalé par le client : « {order.disputeReason} »</p>
                    )}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {order.items.map((item, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span className="text-warm-700">
                          {item.name} × {formatQuantity(item.quantity, 'pièce')}
                        </span>
                        <span className="font-medium">{formatPrice(item.price * item.quantity)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between border-t pt-1 text-warm-600">
                      <span>Livraison</span>
                      <span>{order.shippingCost === 0 ? 'Gratuite' : formatPrice(order.shippingCost)}</span>
                    </li>
                    <li className="flex justify-between font-semibold text-warm-800">
                      <span>Total</span>
                      <span>{formatPrice(order.total)}</span>
                    </li>
                    {order.sellerAmount != null && (
                      <li className="flex justify-between rounded-lg bg-green-50 px-2 py-1 text-green-800">
                        <span>
                          Vous recevez
                          {order.commissionAmount != null && (
                            <span className="font-normal"> (commission {formatPrice(order.commissionAmount)})</span>
                          )}
                        </span>
                        <span className="font-semibold">
                          {formatPrice(order.sellerAmount)}
                          {order.reversed && ' · versé'}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>

                {!closed && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                    {step && !canAdvance && (
                      <p className="w-full text-sm text-warm-500">
                        {cashOnDelivery
                          ? 'Paiement à la livraison : la plateforme marque la commande livrée à la remise de l’argent par le livreur.'
                          : 'À préparer une fois le paiement confirmé par la plateforme.'}
                      </p>
                    )}
                    {step?.to === 'shipped' && canAdvance && order.deliveryMethod !== 'retrait' && (
                      <div className="grid w-full gap-2 sm:grid-cols-2">
                        <input
                          className="rounded-lg border border-warm-300 px-3 py-2 text-sm"
                          placeholder="Transporteur (facultatif)"
                          aria-label="Transporteur"
                          maxLength={60}
                          value={tracking[order.id]?.carrier ?? ''}
                          onChange={(e) =>
                            setTracking({ ...tracking, [order.id]: { ...trackingOf(order.id), carrier: e.target.value } })
                          }
                        />
                        <input
                          className="rounded-lg border border-warm-300 px-3 py-2 text-sm"
                          placeholder="Numéro de suivi (facultatif, envoyé au client)"
                          aria-label="Numéro de suivi"
                          maxLength={80}
                          value={tracking[order.id]?.trackingNumber ?? ''}
                          onChange={(e) =>
                            setTracking({ ...tracking, [order.id]: { ...trackingOf(order.id), trackingNumber: e.target.value } })
                          }
                        />
                      </div>
                    )}
                    {step && canAdvance && (
                      <button
                        type="button"
                        disabled={busy === order.id}
                        onClick={() => change(order, step.to)}
                        className="rounded-lg bg-prairie-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {step.label}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy === order.id}
                      onClick={() => {
                        const reason = window.prompt('Motif de l’annulation (facultatif) :');
                        if (reason !== null) change(order, 'cancelled', reason || undefined);
                      }}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Modal } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import {
  PAYMENT_STATUS_LABELS,
  confirmPayment,
  getAdminPayments,
  rejectPayment,
  type AdminPayment,
  type PaymentStatus,
} from '@/lib/api/payments';

const filters: { key: PaymentStatus | 'all'; label: string }[] = [
  { key: 'submitted', label: 'À vérifier' },
  { key: 'awaiting', label: 'En attente du client' },
  { key: 'paid', label: 'Confirmés' },
  { key: 'rejected', label: 'Refusés' },
  { key: 'all', label: 'Tous' },
];

const statusStyle: Record<PaymentStatus, string> = {
  awaiting: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

// Vérification des paiements Mobile Money : l'administrateur compare la référence et le montant avec
// les transactions reçues sur le compte marchand, puis confirme (la commande démarre) ou refuse.
export default function AdminPaymentsPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('submitted');
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<AdminPayment | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setPayments((await getAdminPayments(token, filter)).payments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les paiements');
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async (payment: AdminPayment) => {
    if (!token) return;
    setConfirmingId(payment.id);
    try {
      await confirmPayment(payment.id, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation impossible');
    } finally {
      setConfirmingId(null);
    }
  };

  const confirmReject = async () => {
    if (!token || !rejecting) return;
    setSaving(true);
    try {
      await rejectPayment(rejecting.id, reason.trim(), token);
      setRejecting(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refus impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-warm-800">Paiements Mobile Money</h1>
      <p className="mb-6 text-sm text-warm-600">
        Vérifiez chaque référence de transaction et son montant sur votre compte marchand avant de confirmer : la
        commande démarre dès la confirmation.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-prairie-600 text-white' : 'bg-white text-warm-600 hover:bg-warm-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-prairie-600" />
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center">
          <i className="bi bi-phone mx-auto mb-4 text-warm-300 text-[48px] leading-none" aria-hidden="true" />
          <p className="text-warm-600">Aucun paiement dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <div key={payment.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-warm-800">{formatPrice(payment.totalAmount)}</h2>
                    <span className="text-sm text-warm-600">via {payment.methodLabel ?? '—'}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[payment.paymentStatus]}`}>
                      {PAYMENT_STATUS_LABELS[payment.paymentStatus]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-warm-700">
                    Commande{payment.orders.length > 1 ? 's' : ''} : {payment.orders.map((o) => o.orderNumber).join(', ')}
                  </p>
                  <p className="text-sm text-warm-600">
                    Client : <strong>{payment.buyer.name}</strong>
                    {payment.buyer.email && ` · ${payment.buyer.email}`}
                    {payment.buyer.phone && ` · ${payment.buyer.phone}`}
                  </p>
                  {payment.automatic && (
                    <p
                      className={`mt-2 rounded-lg p-2 text-sm ${
                        payment.attempt?.status === 'review'
                          ? 'bg-amber-50 text-amber-800'
                          : payment.attempt?.status === 'pending'
                            ? 'bg-blue-50 text-blue-800'
                            : 'bg-green-50 text-green-800'
                      }`}
                    >
                      {payment.attempt?.status === 'review' ? (
                        <>
                          <strong>Paiement {payment.methodLabel ?? 'Mobile Money'} à vérifier :</strong> {payment.attempt.failureReason ?? 'écart détecté'}.
                          Contrôlez votre compte {payment.methodLabel ?? 'Mobile Money'} puis confirmez ou refusez.
                        </>
                      ) : payment.attempt?.status === 'pending' ? (
                        <>Paiement {payment.methodLabel ?? 'Mobile Money'} lancé : en attente de la confirmation du client (vérifié automatiquement).</>
                      ) : (
                        <>Paiement lancé par {payment.methodLabel ?? 'Mobile Money'} (confirmation automatique).</>
                      )}
                    </p>
                  )}
                  {payment.reference ? (
                    <p className="mt-2 rounded-lg bg-warm-50 p-2 text-sm text-warm-800">
                      Référence : <strong className="font-mono">{payment.reference}</strong>
                      {payment.payerPhone && <> · payé depuis {payment.payerPhone}</>}
                      {payment.submittedAt && (
                        <span className="text-warm-500">
                          {' '}
                          · envoyée le {new Date(payment.submittedAt).toLocaleString('fr-FR')}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-warm-500">Le client n&apos;a pas encore transmis de référence.</p>
                  )}
                  {payment.rejectionReason && (
                    <p className="mt-1 text-sm text-red-600">Motif du refus : {payment.rejectionReason}</p>
                  )}
                </div>
                {payment.paymentStatus !== 'paid' && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      icon={<i className="bi bi-check-lg text-[16px] leading-none" aria-hidden="true" />}
                      loading={confirmingId === payment.id}
                      onClick={() => confirm(payment)}
                    >
                      Confirmer
                    </Button>
                    {payment.paymentStatus !== 'rejected' && (
                      <Button size="sm" variant="outline" icon={<i className="bi bi-x-lg text-[16px] leading-none" aria-hidden="true" />} onClick={() => setRejecting(payment)}>
                        Refuser
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!rejecting} onClose={() => setRejecting(null)} title="Refuser ce paiement">
        <p className="mb-3 text-sm text-warm-600">
          Le client recevra ce motif par e-mail et pourra saisir une nouvelle référence.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Motif du refus (ex. transaction introuvable, montant incorrect)"
          className="mb-4 w-full rounded-lg border border-warm-300 p-3 text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejecting(null)}>Annuler</Button>
          <Button loading={saving} disabled={reason.trim().length < 3} onClick={confirmReject}>
            Refuser le paiement
          </Button>
        </div>
      </Modal>
    </div>
  );
}

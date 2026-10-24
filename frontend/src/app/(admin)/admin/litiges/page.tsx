'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Modal } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { getAdminDisputes, resolveDispute, type AdminDispute } from '@/lib/api/orders';

const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

// Paiement garanti : problèmes signalés par les acheteurs. Tant qu'un litige est ouvert, le vendeur n'est pas
// reversé. L'administrateur rembourse l'acheteur (hors du site, puis la commande est annulée) ou libère l'argent.
export default function AdminDisputesPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [showAll, setShowAll] = useState(false);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ dispute: AdminDispute; resolution: 'refund' | 'release' } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setDisputes((await getAdminDisputes(token, showAll)).disputes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les litiges');
    } finally {
      setLoading(false);
    }
  }, [token, showAll]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async () => {
    if (!token || !deciding) return;
    setSaving(true);
    try {
      await resolveDispute(deciding.dispute.id, deciding.resolution, note, token);
      setDeciding(null);
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Décision impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-warm-800">Litiges</h1>
      <p className="mb-6 text-sm text-warm-600">
        Problèmes signalés par les acheteurs après expédition ou livraison. Le vendeur n&apos;est pas reversé tant que le
        litige est ouvert. Contactez l&apos;acheteur et le vendeur si besoin, puis tranchez.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {[
          { all: false, label: 'En cours' },
          { all: true, label: 'Tous' },
        ].map((f) => (
          <button
            key={f.label}
            onClick={() => setShowAll(f.all)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              showAll === f.all ? 'bg-prairie-600 text-white' : 'bg-white text-warm-600 hover:bg-warm-100'
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
      ) : disputes.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center">
          <i className="bi bi-shield-check mx-auto mb-4 text-warm-300 text-[48px] leading-none" aria-hidden="true" />
          <p className="text-warm-600">{showAll ? 'Aucun litige pour le moment.' : 'Aucun litige en cours.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => {
            const open = !dispute.disputeResolvedAt;
            return (
              <div key={dispute.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-warm-800">{dispute.orderNumber}</h2>
                      <span className="text-sm text-warm-600">{formatPrice(dispute.total)}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          open
                            ? 'bg-red-100 text-red-800'
                            : dispute.disputeResolution === 'refund'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {open ? 'En cours' : dispute.disputeResolution === 'refund' ? 'Acheteur remboursé' : 'Argent libéré'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-warm-600">
                      Acheteur : <strong>{dispute.buyerName}</strong>
                      {dispute.buyerPhone && ` · ${dispute.buyerPhone}`}
                      {dispute.buyerEmail && ` · ${dispute.buyerEmail}`}
                    </p>
                    <p className="text-sm text-warm-600">Vendeur : {dispute.sellerName ?? 'Plateforme'}</p>
                    <p className="text-sm text-warm-500">
                      Signalé le {dateTime(dispute.disputeOpenedAt)}
                      {dispute.disputeResolvedAt && ` · tranché le ${dateTime(dispute.disputeResolvedAt)}`}
                    </p>
                    <blockquote className="mt-2 rounded-lg border-l-4 border-red-400 bg-red-50 p-2 text-sm text-warm-800">
                      {dispute.disputeReason}
                    </blockquote>
                    <ul className="mt-2 text-sm text-warm-600">
                      {dispute.items.map((item, i) => (
                        <li key={i}>
                          {item.name} × {item.quantity} — {formatPrice(item.price * item.quantity)}
                        </li>
                      ))}
                    </ul>
                    {dispute.disputeNote && <p className="mt-2 text-sm text-warm-700">Décision : {dispute.disputeNote}</p>}
                  </div>
                  {open && (
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
                      <Button
                        size="sm"
                        icon={<i className="bi bi-arrow-counterclockwise text-[16px] leading-none" aria-hidden="true" />}
                        onClick={() => setDeciding({ dispute, resolution: 'refund' })}
                      >
                        Rembourser l&apos;acheteur
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<i className="bi bi-unlock text-[16px] leading-none" aria-hidden="true" />}
                        onClick={() => setDeciding({ dispute, resolution: 'release' })}
                      >
                        Libérer pour le vendeur
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding?.resolution === 'refund' ? 'Rembourser l’acheteur' : 'Libérer l’argent pour le vendeur'}
      >
        <p className="mb-3 text-sm text-warm-600">
          {deciding?.resolution === 'refund'
            ? `Remboursez ${deciding ? formatPrice(deciding.dispute.total) : ''} à l'acheteur (Mobile Money, ou sur sa carte depuis le tableau de bord du prestataire) : la commande sera annulée et jamais reversée au vendeur.`
            : 'La commande sera considérée comme reçue : le vendeur pourra être reversé.'}{' '}
          L&apos;acheteur est prévenu par e-mail et SMS.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Message pour l'acheteur (facultatif) : référence du remboursement, explication…"
          className="mb-4 w-full rounded-lg border border-warm-300 p-3 text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeciding(null)}>Annuler</Button>
          <Button loading={saving} onClick={decide}>
            Confirmer la décision
          </Button>
        </div>
      </Modal>
    </div>
  );
}

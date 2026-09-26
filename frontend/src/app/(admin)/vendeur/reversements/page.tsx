'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Input, Select } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import {
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHOD_OPTIONS,
  getSellerEarnings,
  savePayoutDetails,
  type PayoutMethodId,
  type SellerEarnings,
  type SellerOrderState,
} from '@/lib/api/payouts';
import { PageHead } from '@/components/admin/AdminShell';

const formatRate = (rate: number) => `${String(rate).replace('.', ',')} %`;

const STATE: Record<SellerOrderState, { label: string; className: string }> = {
  in_progress: { label: 'En cours', className: 'tone-warning' },
  to_receive: { label: 'À recevoir', className: 'tone-info' },
  reversed: { label: 'Versée', className: 'tone-success' },
};

// Mes gains : ce que la plateforme m'a versé, ce qu'elle me doit (commandes livrées) et ce qui est en cours.
export default function SellerPayoutsPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [data, setData] = useState<SellerEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<PayoutMethodId>('mvola');
  const [number, setNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const earnings = await getSellerEarnings(token);
      setData(earnings);
      setMethod(earnings.payoutDetails.method ?? 'mvola');
      setNumber(earnings.payoutDetails.number ?? '');
      setAccountName(earnings.payoutDetails.accountName ?? '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger vos gains');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaved(false);
    setFormError(null);
    try {
      await savePayoutDetails({ method, number: number.trim(), accountName: accountName.trim() || undefined }, token);
      setSaved(true);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const head = (
    <PageHead
      title="Mes gains"
      crumbs={[{ label: 'Espace vendeur', href: '/vendeur' }, { label: 'Mes gains' }]}
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
    <div className="space-y-8">
      {head}
      {error && (
        <div role="alert" className="sw-alert tone-danger">
          <i className="bi bi-exclamation-circle"></i>
          <span>{error}</span>
        </div>
      )}

      {data && (
        <>
          <section aria-label="Résumé">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'À recevoir', value: formatPrice(data.totals.toReceive), note: 'Commandes livrées, pas encore versées', icon: 'bi-hourglass-split', tone: 'tone-accent' },
                { label: 'En cours', value: formatPrice(data.totals.inProgress), note: 'Payées par le client, pas encore livrées', icon: 'bi-truck', tone: 'tone-info' },
                { label: 'Déjà reçu', value: formatPrice(data.totals.received), note: 'Reversements effectués', icon: 'bi-check2-circle', tone: 'tone-success' },
                {
                  label: 'Commission de la plateforme',
                  value: formatRate(data.rate),
                  note: `${data.hasCustomRate ? 'Taux négocié pour votre compte' : 'Taux standard'} · sur le prix des produits`,
                  icon: 'bi-percent',
                  tone: 'tone-warning',
                },
              ].map((kpi) => (
                <div key={kpi.label} className={`kpi-card ${kpi.tone}`}>
                  <span className="kpi-icon"><i className={`bi ${kpi.icon}`}></i></span>
                  <div className="min-w-0">
                    <div className="kpi-label">{kpi.label}</div>
                    <div className="kpi-value">{kpi.value}</div>
                    <div className="kpi-trend">{kpi.note}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-warm-600">
              Le client paie la plateforme. Dès qu&apos;une commande est <strong>livrée</strong>, elle vous est reversée
              (moins la commission) sur le compte ci-dessous. Les frais de livraison vous reviennent en totalité.
            </p>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm" aria-label="Où recevoir mes paiements">
            <h2 className="mb-1 font-semibold text-warm-800">Où recevoir mes paiements</h2>
            {!data.payoutDetails.number && (
              <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Renseignez votre numéro Mobile Money (ou IBAN) : sans cela, la plateforme ne peut pas vous reverser vos ventes.
              </p>
            )}
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
              <Select label="Moyen" value={method} onChange={(e) => setMethod(e.target.value as PayoutMethodId)} options={PAYOUT_METHOD_OPTIONS} />
              <Input
                label={method === 'bank_transfer' ? 'IBAN / numéro de compte' : 'Numéro Mobile Money'}
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setSaved(false);
                }}
                placeholder={method === 'bank_transfer' ? 'MG46 …' : '034 00 000 00'}
                maxLength={40}
                required
              />
              <Input label="Nom du titulaire (facultatif)" value={accountName} onChange={(e) => setAccountName(e.target.value)} maxLength={100} />
              <div className="flex items-center gap-3 sm:col-span-3">
                <Button type="submit" loading={saving} disabled={number.trim().length < 6}>
                  Enregistrer
                </Button>
                {saved && (
                  <span role="status" className="text-sm text-green-700">
                    Enregistré
                  </span>
                )}
                {formError && (
                  <span role="alert" className="text-sm text-red-600">
                    {formError}
                  </span>
                )}
              </div>
            </form>
          </section>

          <section aria-label="Mes ventes">
            <h2 className="mb-3 font-semibold text-warm-800">Mes ventes payées</h2>
            {data.orders.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-warm-600">Aucune vente payée pour le moment.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-warm-50 text-left text-warm-600">
                    <tr>
                      <th className="px-4 py-3">Commande</th>
                      <th className="px-4 py-3 text-right">Produits</th>
                      <th className="px-4 py-3 text-right">Livraison</th>
                      <th className="px-4 py-3 text-right">Commission</th>
                      <th className="px-4 py-3 text-right">Vous recevez</th>
                      <th className="px-4 py-3">État</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-100">
                    {data.orders.map((o) => (
                      <tr key={o.orderNumber}>
                        <td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td>
                        <td className="px-4 py-3 text-right">{formatPrice(o.subtotal)}</td>
                        <td className="px-4 py-3 text-right">{o.shippingCost === 0 ? '—' : formatPrice(o.shippingCost)}</td>
                        <td className="px-4 py-3 text-right text-warm-500">
                          {o.commissionAmount === null ? '—' : `− ${formatPrice(o.commissionAmount)}`}
                          {o.commissionRate !== null && <span className="text-xs"> ({formatRate(o.commissionRate)})</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-warm-800">{o.sellerAmount === null ? '—' : formatPrice(o.sellerAmount)}</td>
                        <td className="px-4 py-3">
                          <span className={`pill ${STATE[o.state].className}`}>{STATE[o.state].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Reversements reçus">
            <h2 className="mb-3 font-semibold text-warm-800">Reversements reçus</h2>
            {data.payouts.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-warm-600">Aucun reversement pour le moment.</div>
            ) : (
              <div className="space-y-3">
                {data.payouts.map((p) => (
                  <div key={p.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-warm-800">{formatPrice(p.amount)}</p>
                      <p className="text-sm text-warm-500">
                        {PAYOUT_METHOD_LABELS[p.method]} · réf. <span className="font-mono">{p.reference}</span> · {new Date(p.paidAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-warm-500">
                      {p.ordersCount} commande(s) : {p.orderNumbers.join(', ')} · commission retenue {formatPrice(p.commissionTotal)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

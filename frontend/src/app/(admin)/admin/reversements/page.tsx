'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import {
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHOD_OPTIONS,
  createPayout,
  getEligibleOrders,
  getPayoutHistory,
  getPayoutSummary,
  setSellerCommission,
  type AdminPayoutRecord,
  type AdminPayoutSeller,
  type AdminPayoutSummary,
  type EligibleOrder,
  type PayoutMethodId,
} from '@/lib/api/payouts';

type Tab = 'sellers' | 'history';

const formatRate = (rate: number) => `${String(rate).replace('.', ',')} %`;
const formatDateTime = (value: string) => new Date(value).toLocaleString('fr-FR');

function StatCard({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-sm text-warm-500">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-warm-800">{value}</p>
      {hint && <p className="mt-1 text-xs text-warm-500">{hint}</p>}
    </div>
  );
}

// Commissions et reversements : l'argent des ventes des vendeurs arrive sur le compte de la plateforme ;
// ici on voit ce qui est dû à chacun, on enregistre le versement effectué (Mobile Money / virement) et on
// règle les taux de commission.
export default function AdminPayoutsPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [tab, setTab] = useState<Tab>('sellers');
  const [summary, setSummary] = useState<AdminPayoutSummary | null>(null);
  const [history, setHistory] = useState<AdminPayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reversement en cours de saisie
  const [paying, setPaying] = useState<AdminPayoutSeller | null>(null);
  const [eligible, setEligible] = useState<EligibleOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [method, setMethod] = useState<PayoutMethodId>('mvola');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Taux de commission d'un vendeur
  const [rateSeller, setRateSeller] = useState<AdminPayoutSeller | null>(null);
  const [rateValue, setRateValue] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [s, h] = await Promise.all([getPayoutSummary(token), getPayoutHistory(token)]);
      setSummary(s);
      setHistory(h.payouts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les reversements');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openPayout = async (seller: AdminPayoutSeller) => {
    if (!token) return;
    setPaying(seller);
    setEligible([]);
    setSelected(new Set());
    setReference('');
    setNote('');
    setModalError(null);
    setMethod(seller.payout.method ?? 'mvola');
    setEligibleLoading(true);
    try {
      const { orders } = await getEligibleOrders(seller.id, token);
      setEligible(orders);
      setSelected(new Set(orders.map((o) => o.id)));
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Impossible de charger les commandes');
    } finally {
      setEligibleLoading(false);
    }
  };

  const selectedOrders = useMemo(() => eligible.filter((o) => selected.has(o.id)), [eligible, selected]);
  const selectedAmount = selectedOrders.reduce((sum, o) => sum + (o.sellerAmount ?? 0), 0);
  const selectedCommission = selectedOrders.reduce((sum, o) => sum + (o.commissionAmount ?? 0), 0);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirmPayout = async () => {
    if (!token || !paying) return;
    setSaving(true);
    setModalError(null);
    try {
      await createPayout(
        paying.id,
        {
          method,
          reference: reference.trim(),
          note: note.trim() || undefined,
          orderIds: selectedOrders.map((o) => o.id),
        },
        token
      );
      setPaying(null);
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const openRate = (seller: AdminPayoutSeller) => {
    setRateSeller(seller);
    setRateValue(seller.commissionRate === null ? '' : String(seller.commissionRate));
    setModalError(null);
  };

  const saveRate = async (rate: number | null) => {
    if (!token || !rateSeller) return;
    setSaving(true);
    setModalError(null);
    try {
      await setSellerCommission(rateSeller.id, rate, token);
      setRateSeller(null);
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const parsedRate = Number(rateValue.replace(',', '.'));
  const rateValid = rateValue.trim() !== '' && Number.isFinite(parsedRate) && parsedRate >= 0 && parsedRate <= (summary?.maxRate ?? 50);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-warm-800">Commissions et reversements</h1>
      <p className="mb-6 text-sm text-warm-600">
        Les paiements des clients arrivent sur votre compte Mobile Money. Une commande de vendeur devient reversible
        une fois <strong>payée et livrée</strong> : vous envoyez la part du vendeur (moins votre commission), puis
        vous l&apos;enregistrez ici avec la référence de la transaction.
      </p>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-prairie-600" />
        </div>
      ) : summary ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="À reverser (livrées)" value={formatPrice(summary.totals.toPayOut)} icon={<i className="bi bi-wallet2 text-[16px] leading-none" aria-hidden="true" />} hint="Commandes payées et livrées" />
            <StatCard label="En cours" value={formatPrice(summary.totals.pending)} icon={<i className="bi bi-cash-stack text-[16px] leading-none" aria-hidden="true" />} hint="Payées, pas encore livrées" />
            <StatCard label="Déjà versé" value={formatPrice(summary.totals.paidOut)} icon={<i className="bi bi-cash-stack text-[16px] leading-none" aria-hidden="true" />} />
            <StatCard
              label="Vos commissions"
              value={formatPrice(summary.totals.commissionEarned)}
              icon={<i className="bi bi-percent text-[16px] leading-none" aria-hidden="true" />}
              hint={`Sur les ventes payées · taux par défaut ${formatRate(summary.defaultRate)}`}
            />
          </div>

          <div className="mb-6 flex gap-2">
            {(
              [
                ['sellers', 'Par vendeur'],
                ['history', `Historique (${history.length})`],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === key ? 'bg-prairie-600 text-white' : 'bg-white text-warm-600 hover:bg-warm-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'sellers' &&
            (summary.sellers.length === 0 ? (
              <div className="rounded-xl bg-white p-12 text-center text-warm-600">Aucun vendeur pour le moment.</div>
            ) : (
              <div className="space-y-4">
                {summary.sellers.map((seller) => (
                  <div key={seller.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-warm-800">{seller.name}</h2>
                        <p className="text-sm text-warm-500">{seller.contactEmail}</p>
                        <p className="mt-2 text-sm text-warm-700">
                          Commission :{' '}
                          <strong>{formatRate(seller.effectiveRate)}</strong>
                          <span className="text-warm-500">{seller.commissionRate === null ? ' (taux par défaut)' : ' (taux propre)'}</span>{' '}
                          <button onClick={() => openRate(seller)} className="text-prairie-600 underline">
                            Modifier
                          </button>
                        </p>
                        {seller.payout.method && seller.payout.number ? (
                          <p className="mt-1 text-sm text-warm-700">
                            Reverser à : <strong>{PAYOUT_METHOD_LABELS[seller.payout.method]}</strong> · {seller.payout.number}
                            {seller.payout.accountName && <span className="text-warm-500"> ({seller.payout.accountName})</span>}
                          </p>
                        ) : (
                          <p className="mt-1 flex items-center gap-1 text-sm text-amber-700">
                            <i className="bi bi-exclamation-triangle text-[16px] leading-none" aria-hidden="true" /> Le vendeur n&apos;a pas encore renseigné où le payer.
                          </p>
                        )}
                      </div>
                      <dl className="grid shrink-0 grid-cols-3 gap-4 text-sm lg:text-right">
                        <div>
                          <dt className="text-warm-500">À reverser</dt>
                          <dd className="font-bold text-warm-800">{formatPrice(seller.eligible.amount)}</dd>
                          <dd className="text-xs text-warm-500">{seller.eligible.count} commande(s)</dd>
                        </div>
                        <div>
                          <dt className="text-warm-500">En cours</dt>
                          <dd className="font-medium text-warm-700">{formatPrice(seller.pending.amount)}</dd>
                          <dd className="text-xs text-warm-500">{seller.pending.count} commande(s)</dd>
                        </div>
                        <div>
                          <dt className="text-warm-500">Déjà versé</dt>
                          <dd className="font-medium text-warm-700">{formatPrice(seller.paidOut.amount)}</dd>
                        </div>
                      </dl>
                      <div className="shrink-0">
                        <Button size="sm" disabled={seller.eligible.count === 0} onClick={() => openPayout(seller)}>
                          Reverser {seller.eligible.count > 0 ? formatPrice(seller.eligible.amount) : ''}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {tab === 'history' &&
            (history.length === 0 ? (
              <div className="rounded-xl bg-white p-12 text-center text-warm-600">Aucun reversement enregistré.</div>
            ) : (
              <div className="space-y-3">
                {history.map((p) => (
                  <div key={p.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-warm-800">
                          {formatPrice(p.amount)} <span className="font-normal text-warm-600">à {p.sellerName}</span>
                        </p>
                        <p className="text-sm text-warm-500">
                          {PAYOUT_METHOD_LABELS[p.method]} · réf. <span className="font-mono">{p.reference}</span> · {formatDateTime(p.paidAt)}
                        </p>
                      </div>
                      <p className="text-sm text-warm-600">Commission retenue : {formatPrice(p.commissionTotal)}</p>
                    </div>
                    <p className="mt-2 text-xs text-warm-500">
                      {p.ordersCount} commande(s) : {p.orderNumbers.join(', ')}
                    </p>
                    {p.note && <p className="mt-1 text-xs italic text-warm-500">« {p.note} »</p>}
                  </div>
                ))}
              </div>
            ))}
        </>
      ) : null}

      {/* Enregistrer un reversement */}
      <Modal isOpen={!!paying} onClose={() => setPaying(null)} title={paying ? `Reverser ${paying.name}` : ''} size="lg">
        {paying && (
          <div className="space-y-4">
            {eligibleLoading ? (
              <div className="h-24 animate-pulse rounded-lg bg-warm-50" />
            ) : (
              <>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-warm-200">
                  <table className="w-full text-sm">
                    <thead className="bg-warm-50 text-left text-warm-600">
                      <tr>
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2">Commande</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">Commission</th>
                        <th className="px-3 py-2 text-right">Part vendeur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-100">
                      {eligible.map((o) => (
                        <tr key={o.id}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(o.id)}
                              onChange={() => toggle(o.id)}
                              aria-label={`Inclure ${o.orderNumber}`}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{o.orderNumber}</td>
                          <td className="px-3 py-2 text-right">{formatPrice(o.total)}</td>
                          <td className="px-3 py-2 text-right text-warm-500">
                            {formatPrice(o.commissionAmount ?? 0)}
                            {o.commissionRate !== null && <span className="text-xs"> ({formatRate(o.commissionRate)})</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{formatPrice(o.sellerAmount ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg bg-prairie-50 p-3 text-sm">
                  <p className="text-warm-700">
                    Montant à envoyer à <strong>{paying.name}</strong> :{' '}
                    <strong className="text-lg text-prairie-700">{formatPrice(selectedAmount)}</strong>
                  </p>
                  <p className="text-warm-500">Commission retenue sur ces {selectedOrders.length} commande(s) : {formatPrice(selectedCommission)}</p>
                  {paying.payout.number && (
                    <p className="mt-1 text-warm-700">
                      Vers : {paying.payout.method && PAYOUT_METHOD_LABELS[paying.payout.method]} · <strong>{paying.payout.number}</strong>
                    </p>
                  )}
                </div>

                <p className="text-xs text-warm-500">
                  Envoyez d&apos;abord l&apos;argent depuis votre compte marchand, puis saisissez ici la référence de votre
                  transaction. Les commandes sont alors verrouillées : elles ne pourront plus être reversées ni annulées.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Envoyé par" value={method} onChange={(e) => setMethod(e.target.value as PayoutMethodId)} options={PAYOUT_METHOD_OPTIONS} />
                  <Input
                    label="Référence de la transaction"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ex. MP260920.1234.A56789"
                    maxLength={80}
                    autoComplete="off"
                  />
                </div>
                <Input label="Note (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
              </>
            )}

            {modalError && (
              <p role="alert" className="text-sm text-red-600">
                {modalError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setPaying(null)} disabled={saving}>
                Annuler
              </Button>
              <Button
                loading={saving}
                disabled={eligibleLoading || selectedOrders.length === 0 || reference.trim().length < 3}
                onClick={confirmPayout}
              >
                Enregistrer le reversement
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Taux de commission */}
      <Modal isOpen={!!rateSeller} onClose={() => setRateSeller(null)} title={rateSeller ? `Commission de ${rateSeller.name}` : ''} size="sm">
        {rateSeller && summary && (
          <div className="space-y-4">
            <p className="text-sm text-warm-600">
              Pourcentage retenu sur le sous-total de chaque <strong>nouvelle</strong> vente payée. Les commandes déjà
              payées gardent leur taux. Taux par défaut de la plateforme : {formatRate(summary.defaultRate)}.
            </p>
            <Input
              label={`Taux propre à ce vendeur (0 à ${summary.maxRate} %)`}
              inputMode="decimal"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              placeholder={`Ex. ${summary.defaultRate}`}
              error={rateValue !== '' && !rateValid ? `Entre 0 et ${summary.maxRate}` : undefined}
            />
            {modalError && (
              <p role="alert" className="text-sm text-red-600">
                {modalError}
              </p>
            )}
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button variant="ghost" size="sm" disabled={saving || rateSeller.commissionRate === null} onClick={() => saveRate(null)}>
                Utiliser le taux par défaut
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRateSeller(null)} disabled={saving}>
                  Annuler
                </Button>
                <Button size="sm" loading={saving} disabled={!rateValid} onClick={() => saveRate(parsedRate)}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

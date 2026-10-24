'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Modal } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import {
  createPromoCode,
  getAdminPromoCodes,
  updatePromoCode,
  type AdminPromoCode,
  type AdminPromoList,
  type PromoCodeInput,
} from '@/lib/api/promo';

const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const emptyForm = {
  code: '',
  type: 'percent' as 'percent' | 'fixed',
  value: '',
  maxDiscount: '',
  minSubtotal: '',
  endsAt: '',
  maxUses: '',
  firstOrderOnly: false,
  description: '',
};

const fieldClass = 'w-full rounded-lg border border-warm-300 px-3 py-2 text-sm';
const toInt = (value: string) => (value.trim() ? Math.round(Number(value)) : undefined);

function codeState(code: AdminPromoCode): { label: string; className: string } {
  const now = Date.now();
  if (!code.isActive) return { label: 'Désactivé', className: 'bg-warm-100 text-warm-600' };
  if (code.endsAt && new Date(code.endsAt).getTime() <= now) return { label: 'Expiré', className: 'bg-warm-100 text-warm-600' };
  if (code.maxUses !== null && code.usedCount >= code.maxUses) return { label: 'Épuisé', className: 'bg-warm-100 text-warm-600' };
  if (code.startsAt && new Date(code.startsAt).getTime() > now) return { label: 'Programmé', className: 'bg-blue-100 text-blue-800' };
  return { label: 'Actif', className: 'bg-green-100 text-green-800' };
}

// Codes promo des campagnes (fêtes, ouverture, réseaux sociaux). Les remises sont prises en charge par la
// plateforme : le vendeur reçoit le même montant. Les codes de parrainage et bons d'achat se gèrent seuls.
export default function AdminPromoCodesPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [data, setData] = useState<AdminPromoList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await getAdminPromoCodes(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les codes promo');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const input: PromoCodeInput = {
      code: form.code,
      type: form.type,
      value: toInt(form.value) ?? 0,
      maxDiscount: form.type === 'percent' ? toInt(form.maxDiscount) ?? null : null,
      minSubtotal: toInt(form.minSubtotal) ?? 0,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      maxUses: toInt(form.maxUses) ?? null,
      firstOrderOnly: form.firstOrderOnly,
      description: form.description.trim() || null,
    };
    setSaving(true);
    setFormError(null);
    try {
      await createPromoCode(input, token);
      setCreating(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (code: AdminPromoCode) => {
    if (!token) return;
    setToggling(code.id);
    try {
      await updatePromoCode(code.id, { isActive: !code.isActive }, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modification impossible');
    } finally {
      setToggling(null);
    }
  };

  const settings = data?.referral.settings;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-warm-800">Codes promo</h1>
          <p className="text-sm text-warm-600">
            Remises sur les articles (jamais la livraison), prises en charge par la plateforme : le vendeur reçoit le même
            montant.
          </p>
        </div>
        <Button icon={<i className="bi bi-plus-lg text-[16px] leading-none" aria-hidden="true" />} onClick={() => setCreating(true)}>
          Nouveau code
        </Button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {settings && (
        <div className="mb-6 rounded-xl bg-white p-4 text-sm text-warm-700 shadow-sm">
          <h2 className="mb-1 font-semibold text-warm-800">
            <i className="bi bi-gift mr-2 text-prairie-600" aria-hidden="true" />
            Parrainage
          </h2>
          {settings.discountPercent > 0 ? (
            <p>
              Filleul : -{settings.discountPercent} % sur sa première commande (max {formatPrice(settings.discountMax)}) · parrain :
              bon de {formatPrice(settings.rewardAmount)} valable {settings.rewardDays} jours. {data.referral.uses} utilisation
              {data.referral.uses > 1 ? 's' : ''}, {formatPrice(data.referral.totalDiscount)} de remises au total.
            </p>
          ) : (
            <p>Désactivé (REFERRAL_DISCOUNT_PERCENT=0).</p>
          )}
        </div>
      )}

      {!data ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-prairie-600" />
        </div>
      ) : data.codes.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center">
          <i className="bi bi-tag mx-auto mb-4 text-warm-300 text-[48px] leading-none" aria-hidden="true" />
          <p className="text-warm-600">Aucun code promo pour le moment.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-warm-50 text-warm-600">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Remise</th>
                <th className="px-4 py-3">Conditions</th>
                <th className="px-4 py-3">Utilisations</th>
                <th className="px-4 py-3">État</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.codes.map((code) => {
                const state = codeState(code);
                return (
                  <tr key={code.id} className="border-t border-warm-100">
                    <td className="px-4 py-3">
                      <strong className="font-mono text-warm-800">{code.code}</strong>
                      {code.description && <p className="text-xs text-warm-500">{code.description}</p>}
                    </td>
                    <td className="px-4 py-3">{code.label}</td>
                    <td className="px-4 py-3 text-warm-600">
                      {[
                        code.minSubtotal > 0 && `dès ${formatPrice(code.minSubtotal)}`,
                        code.firstOrderOnly && '1re commande',
                        code.endsAt && `jusqu'au ${dateFr(code.endsAt)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {code.usedCount}
                      {code.maxUses !== null && ` / ${code.maxUses}`}
                      {code.totalDiscount > 0 && <p className="text-xs text-warm-500">{formatPrice(code.totalDiscount)} offerts</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${state.className}`}>{state.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" loading={toggling === code.id} onClick={() => toggle(code)}>
                        {code.isActive ? 'Désactiver' : 'Réactiver'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Nouveau code promo">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-warm-700" htmlFor="pc-code">Code</label>
            <input
              id="pc-code"
              className={`${fieldClass} font-mono uppercase`}
              placeholder="FETE2026"
              maxLength={30}
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-warm-700" htmlFor="pc-type">Type</label>
              <select id="pc-type" className={fieldClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })}>
                <option value="percent">Pourcentage</option>
                <option value="fixed">Montant fixe (Ar)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-warm-700" htmlFor="pc-value">
                {form.type === 'percent' ? 'Remise (%)' : 'Remise (Ar)'}
              </label>
              <input
                id="pc-value"
                type="number"
                min={1}
                max={form.type === 'percent' ? 90 : undefined}
                required
                className={fieldClass}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {form.type === 'percent' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-warm-700" htmlFor="pc-max">Plafond (Ar)</label>
                <input id="pc-max" type="number" min={1} className={fieldClass} placeholder="Aucun" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-warm-700" htmlFor="pc-min">Achat minimum (Ar)</label>
              <input id="pc-min" type="number" min={0} className={fieldClass} placeholder="0" value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-warm-700" htmlFor="pc-ends">Fin de validité</label>
              <input id="pc-ends" type="datetime-local" className={fieldClass} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-warm-700" htmlFor="pc-uses">Utilisations max.</label>
              <input id="pc-uses" type="number" min={1} className={fieldClass} placeholder="Illimitées" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-warm-700">
            <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm({ ...form, firstOrderOnly: e.target.checked })} />
            Réservé à une première commande
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium text-warm-700" htmlFor="pc-desc">Note interne</label>
            <input id="pc-desc" className={fieldClass} maxLength={200} placeholder="Ex. : campagne Facebook de Noël" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <p className="text-xs text-warm-500">Chaque client peut utiliser un code une fois.</p>
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
            <Button type="submit" loading={saving}>Créer le code</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

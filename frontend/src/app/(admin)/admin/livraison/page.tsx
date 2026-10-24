'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Modal } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import {
  getAdminShipping,
  savePickupPoint,
  saveShippingZone,
  type AdminShippingSettings,
  type PickupPointInput,
  type ShippingZoneInput,
} from '@/lib/api/shipping';

type Zone = AdminShippingSettings['zones'][number];
type Point = AdminShippingSettings['pickupPoints'][number];

const fieldClass = 'w-full rounded-lg border border-warm-300 px-3 py-2 text-sm';
const labelClass = 'mb-1 block text-sm font-medium text-warm-700';

const emptyZone = { name: '', cities: '', price: '', delay: '', isDefault: false, isActive: true, sortOrder: '' };
const emptyPoint = { name: '', address: '', city: '', phone: '', openingHours: '', instructions: '', fee: '0', isActive: true };

// Livraison : zones de province (tarif et délai par groupe de villes) et points relais partenaires.
// Antananarivo et ses environs (LOCAL_DELIVERY_CITIES) restent en livraison standard / express.
export default function AdminShippingPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [data, setData] = useState<AdminShippingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState<{ id: string | null; values: typeof emptyZone } | null>(null);
  const [pointForm, setPointForm] = useState<{ id: string | null; values: typeof emptyPoint } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await getAdminShipping(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les réglages de livraison');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (action: () => Promise<unknown>, close: () => void) => {
    setSaving(true);
    setFormError(null);
    try {
      await action();
      close();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const editZone = (zone?: Zone) =>
    setZoneForm({
      id: zone?.id ?? null,
      values: zone
        ? { name: zone.name, cities: zone.cities.join(', '), price: String(zone.price), delay: zone.delay, isDefault: zone.isDefault, isActive: zone.isActive, sortOrder: String(zone.sortOrder) }
        : emptyZone,
    });

  const editPoint = (point?: Point) =>
    setPointForm({
      id: point?.id ?? null,
      values: point
        ? { name: point.name, address: point.address, city: point.city, phone: point.phone ?? '', openingHours: point.openingHours ?? '', instructions: point.instructions ?? '', fee: String(point.fee), isActive: point.isActive }
        : emptyPoint,
    });

  const submitZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !zoneForm) return;
    const v = zoneForm.values;
    const input: ShippingZoneInput = {
      name: v.name.trim(),
      cities: v.cities.split(/[,\n]/).map((c) => c.trim()).filter(Boolean),
      price: Math.round(Number(v.price) || 0),
      delay: v.delay.trim(),
      isDefault: v.isDefault,
      isActive: v.isActive,
      ...(v.sortOrder.trim() ? { sortOrder: Math.round(Number(v.sortOrder)) } : {}),
    };
    save(() => saveShippingZone(zoneForm.id, input, token), () => setZoneForm(null));
  };

  const submitPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !pointForm) return;
    const v = pointForm.values;
    const input: PickupPointInput = {
      name: v.name.trim(),
      address: v.address.trim(),
      city: v.city.trim(),
      phone: v.phone.trim() || null,
      openingHours: v.openingHours.trim() || null,
      instructions: v.instructions.trim() || null,
      fee: Math.round(Number(v.fee) || 0),
      isActive: v.isActive,
    };
    save(() => savePickupPoint(pointForm.id, input, token), () => setPointForm(null));
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-warm-800">Livraison</h1>
      <p className="mb-6 text-sm text-warm-600">
        À domicile à {data?.localCities.join(', ') ?? 'Antananarivo'} (standard / express). Ailleurs : livraison en province au
        tarif de la zone de la ville, ou point relais. Chaque vendeur expédie sa commande : le tarif s&apos;applique par commande.
      </p>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Zones */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-warm-800">Zones de province</h2>
          <Button size="sm" icon={<i className="bi bi-plus-lg text-[16px] leading-none" aria-hidden="true" />} onClick={() => editZone()}>
            Nouvelle zone
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-warm-50 text-warm-600">
              <tr>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Villes</th>
                <th className="px-4 py-3">Tarif</th>
                <th className="px-4 py-3">Délai</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.zones.map((zone) => (
                <tr key={zone.id} className={`border-t border-warm-100 ${zone.isActive ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3 font-medium text-warm-800">
                    {zone.name}
                    {zone.isDefault && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">par défaut</span>}
                    {!zone.isActive && <span className="ml-2 text-xs text-warm-500">(désactivée)</span>}
                  </td>
                  <td className="px-4 py-3 text-warm-600">{zone.isDefault ? 'Toutes les autres villes' : zone.cities.join(', ')}</td>
                  <td className="px-4 py-3">{formatPrice(zone.price)}</td>
                  <td className="px-4 py-3">{zone.delay}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => editZone(zone)}>Modifier</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Points relais */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-warm-800">Points relais</h2>
          <Button size="sm" icon={<i className="bi bi-plus-lg text-[16px] leading-none" aria-hidden="true" />} onClick={() => editPoint()}>
            Nouveau point relais
          </Button>
        </div>
        {data && data.pickupPoints.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-warm-600">
            Aucun point relais. Ajoutez des épiceries ou boutiques partenaires : le choix « Point relais » apparaîtra au paiement.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data?.pickupPoints.map((point) => (
              <div key={point.id} className={`rounded-xl bg-white p-4 shadow-sm ${point.isActive ? '' : 'opacity-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-warm-800">{point.name}</h3>
                    <p className="text-sm text-warm-600">{point.address}, {point.city}</p>
                    {point.openingHours && <p className="text-sm text-warm-500">{point.openingHours}</p>}
                    {point.phone && <p className="text-sm text-warm-500">{point.phone}</p>}
                    <p className="mt-1 text-sm">
                      {point.fee === 0 ? 'Gratuit' : formatPrice(point.fee)} · {point.orders} commande{point.orders > 1 ? 's' : ''}
                      {!point.isActive && ' · désactivé'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => editPoint(point)}>Modifier</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal isOpen={!!zoneForm} onClose={() => setZoneForm(null)} title={zoneForm?.id ? 'Modifier la zone' : 'Nouvelle zone'}>
        {zoneForm && (
          <form onSubmit={submitZone} className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="z-name">Nom</label>
              <input id="z-name" className={fieldClass} required maxLength={60} value={zoneForm.values.name} onChange={(e) => setZoneForm({ ...zoneForm, values: { ...zoneForm.values, name: e.target.value } })} />
            </div>
            {!zoneForm.values.isDefault && (
              <div>
                <label className={labelClass} htmlFor="z-cities">Villes (séparées par des virgules)</label>
                <textarea id="z-cities" rows={3} className={fieldClass} placeholder="Toamasina, Tamatave, Moramanga" value={zoneForm.values.cities} onChange={(e) => setZoneForm({ ...zoneForm, values: { ...zoneForm.values, cities: e.target.value } })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="z-price">Tarif par commande (Ar)</label>
                <input id="z-price" type="number" min={0} required className={fieldClass} value={zoneForm.values.price} onChange={(e) => setZoneForm({ ...zoneForm, values: { ...zoneForm.values, price: e.target.value } })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="z-delay">Délai</label>
                <input id="z-delay" required maxLength={40} className={fieldClass} placeholder="2 à 4 jours" value={zoneForm.values.delay} onChange={(e) => setZoneForm({ ...zoneForm, values: { ...zoneForm.values, delay: e.target.value } })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-warm-700">
              <input type="checkbox" checked={zoneForm.values.isDefault} onChange={(e) => setZoneForm({ ...zoneForm, values: { ...zoneForm.values, isDefault: e.target.checked } })} />
              Zone par défaut (villes absentes des autres zones)
            </label>
            <label className="flex items-center gap-2 text-sm text-warm-700">
              <input type="checkbox" checked={zoneForm.values.isActive} onChange={(e) => setZoneForm({ ...zoneForm, values: { ...zoneForm.values, isActive: e.target.checked } })} />
              Active
            </label>
            {formError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{formError}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setZoneForm(null)}>Annuler</Button>
              <Button type="submit" loading={saving}>Enregistrer</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!pointForm} onClose={() => setPointForm(null)} title={pointForm?.id ? 'Modifier le point relais' : 'Nouveau point relais'}>
        {pointForm && (
          <form onSubmit={submitPoint} className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="p-name">Nom</label>
              <input id="p-name" className={fieldClass} required maxLength={80} placeholder="Épicerie Rova" value={pointForm.values.name} onChange={(e) => setPointForm({ ...pointForm, values: { ...pointForm.values, name: e.target.value } })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelClass} htmlFor="p-address">Adresse</label>
                <input id="p-address" className={fieldClass} required maxLength={200} value={pointForm.values.address} onChange={(e) => setPointForm({ ...pointForm, values: { ...pointForm.values, address: e.target.value } })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-city">Ville</label>
                <input id="p-city" className={fieldClass} required maxLength={60} value={pointForm.values.city} onChange={(e) => setPointForm({ ...pointForm, values: { ...pointForm.values, city: e.target.value } })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="p-phone">Téléphone</label>
                <input id="p-phone" className={fieldClass} maxLength={30} value={pointForm.values.phone} onChange={(e) => setPointForm({ ...pointForm, values: { ...pointForm.values, phone: e.target.value } })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-fee">Frais par commande (Ar)</label>
                <input id="p-fee" type="number" min={0} className={fieldClass} value={pointForm.values.fee} onChange={(e) => setPointForm({ ...pointForm, values: { ...pointForm.values, fee: e.target.value } })} />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="p-hours">Horaires</label>
              <input id="p-hours" className={fieldClass} maxLength={120} placeholder="Lun-sam 8h-18h" value={pointForm.values.openingHours} onChange={(e) => setPointForm({ ...pointForm, values: { ...pointForm.values, openingHours: e.target.value } })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="p-instructions">Indications pour le client</label>
              <input id="p-instructions" className={fieldClass} maxLength={300} placeholder="Face à la pharmacie, demander Hery" value={pointForm.values.instructions} onChange={(e) => setPointForm({ ...pointForm, values: { ...pointForm.values, instructions: e.target.value } })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-warm-700">
              <input type="checkbox" checked={pointForm.values.isActive} onChange={(e) => setPointForm({ ...pointForm, values: { ...pointForm.values, isActive: e.target.checked } })} />
              Proposé aux clients
            </label>
            {formError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{formError}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setPointForm(null)}>Annuler</Button>
              <Button type="submit" loading={saving}>Enregistrer</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

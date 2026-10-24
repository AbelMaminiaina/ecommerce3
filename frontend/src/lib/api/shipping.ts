import { fetchAPI } from './config';

// Livraison : à domicile (Antananarivo et environs), en province (tarif par zone), en point relais, ou retrait.

export interface ShippingZone {
  id: string;
  name: string;
  cities: string[];
  price: number;
  delay: string;
  /** Zone appliquée aux villes absentes de toutes les zones */
  isDefault: boolean;
}

export interface PickupPoint {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  openingHours: string | null;
  instructions: string | null;
  fee: number;
}

export interface ShippingOptions {
  /** Villes desservies à domicile (standard / express) */
  localCities: string[];
  freeShippingThreshold: number;
  costs: { standard: number; express: number };
  zones: ShippingZone[];
  pickupPoints: PickupPoint[];
}

export function getShippingOptions(): Promise<ShippingOptions> {
  return fetchAPI('/shipping/options');
}

// ---------- Administration ----------

export interface AdminShippingSettings {
  localCities: string[];
  zones: (ShippingZone & { isActive: boolean; sortOrder: number })[];
  pickupPoints: (PickupPoint & { isActive: boolean; orders: number })[];
}

export type ShippingZoneInput = Omit<ShippingZone, 'id'> & { isActive?: boolean; sortOrder?: number };
export type PickupPointInput = Omit<PickupPoint, 'id'> & { isActive?: boolean };

export function getAdminShipping(token: string): Promise<AdminShippingSettings> {
  return fetchAPI('/shipping/admin', { token });
}

export function saveShippingZone(id: string | null, data: ShippingZoneInput, token: string) {
  return fetchAPI(id ? `/shipping/admin/zones/${id}` : '/shipping/admin/zones', {
    method: id ? 'PUT' : 'POST',
    token,
    body: JSON.stringify(data),
  });
}

export function savePickupPoint(id: string | null, data: PickupPointInput, token: string) {
  return fetchAPI(id ? `/shipping/admin/pickup-points/${id}` : '/shipping/admin/pickup-points', {
    method: id ? 'PUT' : 'POST',
    token,
    body: JSON.stringify(data),
  });
}

import type { PickupPoint, ShippingZone } from '@prisma/client';
import { isServedCity } from './cities.js';

// Modes de livraison :
//  - standard / express : à domicile dans la zone locale (LOCAL_DELIVERY_CITIES, Antananarivo et environs par
//    défaut), au tarif de lib/shipping.ts ;
//  - province : envoi par transporteur dans une autre ville, au tarif de la zone de la ville (ShippingZone ; la
//    zone « par défaut » couvre les villes absentes des zones) ;
//  - relais : retrait dans un point relais partenaire (PickupPoint), à ses frais propres ;
//  - retrait : retrait sur place, gratuit.

export const DELIVERY_METHODS = ['standard', 'express', 'retrait', 'province', 'relais'] as const;
export type DeliveryMethodId = (typeof DELIVERY_METHODS)[number];

export const HOME_METHODS: readonly string[] = ['standard', 'express', 'province'];

const DEFAULT_LOCAL_CITIES = 'Antananarivo,Ivato,Ambohidratrimo,Talatamaty,Andoharanofotsy,Ambohimangakely,Alasora,Itaosy';

export function localDeliveryCities(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.LOCAL_DELIVERY_CITIES?.trim() || DEFAULT_LOCAL_CITIES)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

export const isLocalCity = (city: string): boolean => isServedCity(city, localDeliveryCities());

type Zone = Pick<ShippingZone, 'name' | 'cities' | 'price' | 'delay' | 'isDefault' | 'isActive' | 'sortOrder'>;

/** Zone de province de cette ville : la première zone active qui la cite, sinon la zone par défaut */
export function findShippingZone<T extends Zone>(city: string, zones: T[]): T | null {
  const active = zones.filter((z) => z.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  return active.find((z) => !z.isDefault && isServedCity(city, z.cities)) ?? active.find((z) => z.isDefault) ?? null;
}

/** Message d'erreur si ce mode ne convient pas à cette adresse ; null sinon */
export function deliveryMethodError(method: string, city: string | null | undefined): string | null {
  if (method === 'standard' || method === 'express') {
    if (!isLocalCity(city ?? '')) {
      return `La livraison ${method === 'express' ? 'express' : 'standard'} est réservée à Antananarivo et ses environs : choisissez la livraison en province`;
    }
  }
  if (method === 'province' && isLocalCity(city ?? '')) {
    return 'Cette adresse est à Antananarivo : choisissez la livraison standard ou express';
  }
  return null;
}

// Vue publique d'un point relais
export const pickupPointView = (p: PickupPoint) => ({
  id: p.id,
  name: p.name,
  address: p.address,
  city: p.city,
  phone: p.phone,
  openingHours: p.openingHours,
  instructions: p.instructions,
  fee: p.fee,
});

// Paiement à la livraison (espèces remises au livreur, ou au retrait sur place).
//
// Proposé si CASH_ON_DELIVERY=true, uniquement :
//  - aux clients connectés (pas aux commandes sans compte : trop de fausses commandes) ;
//  - pour un retrait sur place, ou une livraison dans une des villes de CASH_ON_DELIVERY_CITIES
//    (défaut « Antananarivo », séparées par des virgules) ;
//  - jusqu'à CASH_ON_DELIVERY_MAX_AMOUNT Ariary d'articles (défaut 500 000).
// La commande n'attend pas de paiement pour être préparée et expédiée ; l'administrateur enregistre l'encaissement
// quand le livreur lui remet l'argent (ce qui passe la commande en « livrée »). Le reversement au vendeur suit
// ensuite les règles du paiement garanti (lib/buyerProtection.ts).

import type { Prisma } from '@prisma/client';
import { isServedCity } from './cities.js';

export { isServedCity };

// Commandes dont le paiement est attendu en ligne : seules elles sont relancées puis annulées faute de paiement.
// (`not` seul exclurait aussi les anciennes commandes sans moyen de paiement : SQL ignore les NULL.)
export const NOT_CASH_ON_DELIVERY: Prisma.OrderWhereInput = {
  OR: [{ paymentMethod: null }, { paymentMethod: { not: 'cash_on_delivery' } }],
};

export interface CashOnDeliveryConfig {
  cities: string[];
  maxAmount: number;
}

export function getCashOnDeliveryConfig(env: NodeJS.ProcessEnv = process.env): CashOnDeliveryConfig | null {
  if (env.CASH_ON_DELIVERY?.trim().toLowerCase() !== 'true') return null;
  const cities = (env.CASH_ON_DELIVERY_CITIES ?? 'Antananarivo')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const max = Number(env.CASH_ON_DELIVERY_MAX_AMOUNT);
  return { cities, maxAmount: Number.isFinite(max) && max > 0 ? Math.round(max) : 500_000 };
}

/** Message d'erreur si le paiement à la livraison n'est pas possible pour cette commande ; null sinon */
export function cashOnDeliveryError(
  params: { isGuest: boolean; deliveryMethod: string; city?: string | null; itemsTotal: number },
  config = getCashOnDeliveryConfig()
): string | null {
  if (!config) return "Le paiement à la livraison n'est pas disponible";
  if (params.isGuest) return 'Le paiement à la livraison est réservé aux clients connectés : connectez-vous ou créez un compte';
  if (params.deliveryMethod !== 'retrait' && !isServedCity(params.city ?? '', config.cities)) {
    return `Le paiement à la livraison est proposé uniquement à ${config.cities.join(', ')} (ou au retrait sur place)`;
  }
  if (params.itemsTotal > config.maxAmount) {
    return `Le paiement à la livraison est limité à ${config.maxAmount.toLocaleString('fr-FR')} Ar d'articles : choisissez un paiement en ligne`;
  }
  return null;
}

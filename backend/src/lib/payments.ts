import type { PaymentMethod } from '@prisma/client';
import { getAutomaticOperator } from './operators.js';
import { getCashOnDeliveryConfig } from './cashOnDelivery.js';

// Moyens de paiement proposés à la commande :
//  - Mobile Money : le client envoie le montant au numéro marchand de la plateforme puis saisit la référence de la
//    transaction, qu'un administrateur vérifie ; ou paie instantanément quand l'API de l'opérateur est configurée ;
//  - carte bancaire (Stripe) et PayPal : paiement en ligne uniquement, sur la page du prestataire. Proposés dès que
//    leurs identifiants sont configurés (voir lib/stripe.ts et lib/paypal.ts) ;
//  - paiement à la livraison : espèces au livreur ou au retrait, sous conditions (voir lib/cashOnDelivery.ts).

interface MethodConfig {
  label: string;
  /** Numéro marchand (Mobile Money) ; null pour un paiement en ligne uniquement */
  envKey: string | null;
}

const METHODS: Record<PaymentMethod, MethodConfig> = {
  mvola: { label: 'MVola', envKey: 'PAYMENT_MVOLA_NUMBER' },
  orange_money: { label: 'Orange Money', envKey: 'PAYMENT_ORANGE_MONEY_NUMBER' },
  airtel_money: { label: 'Airtel Money', envKey: 'PAYMENT_AIRTEL_MONEY_NUMBER' },
  stripe: { label: 'Carte bancaire', envKey: null },
  paypal: { label: 'PayPal', envKey: null },
  cash_on_delivery: { label: 'Paiement à la livraison', envKey: null },
};

export const PAYMENT_METHOD_IDS = Object.keys(METHODS) as [PaymentMethod, ...PaymentMethod[]];

export interface PaymentMethodInfo {
  id: PaymentMethod;
  label: string;
  /** Numéro marchand (vide pour la carte bancaire et PayPal) */
  number: string;
  accountName: string;
  /** Paiement instantané par l'API du prestataire disponible (sinon : envoi manuel + référence) */
  automatic: boolean;
  /** Paiement manuel par référence possible (Mobile Money) ; faux pour la carte bancaire et PayPal */
  manual: boolean;
  /** Paiement à la livraison : villes desservies et montant maximal d'articles */
  cashOnDelivery?: { cities: string[]; maxAmount: number };
}

function paymentAccountName(): string {
  return process.env.PAYMENT_ACCOUNT_NAME?.trim() || process.env.PLATFORM_NAME?.trim() || 'Tsena';
}

// Mobile Money : proposé si son numéro marchand est configuré. Carte / PayPal : si leurs identifiants le sont.
export function getPaymentMethods(): PaymentMethodInfo[] {
  return PAYMENT_METHOD_IDS.flatMap((id): PaymentMethodInfo[] => {
    const { label, envKey } = METHODS[id];
    if (id === 'cash_on_delivery') {
      const cod = getCashOnDeliveryConfig();
      return cod ? [{ id, label, number: '', accountName: paymentAccountName(), automatic: false, manual: false, cashOnDelivery: cod }] : [];
    }
    const automatic = getAutomaticOperator(id) !== null;
    if (!envKey) return automatic ? [{ id, label, number: '', accountName: paymentAccountName(), automatic, manual: false }] : [];
    const number = process.env[envKey]?.trim();
    return number ? [{ id, label, number, accountName: paymentAccountName(), automatic, manual: true }] : [];
  });
}

export function getPaymentMethod(id: string | null | undefined): PaymentMethodInfo | null {
  return getPaymentMethods().find((m) => m.id === id) ?? null;
}

export function paymentMethodLabel(id: string | null | undefined): string | null {
  return id && id in METHODS ? METHODS[id as PaymentMethod].label : null;
}

// Vrai si le moyen de paiement accepte un paiement manuel par référence (Mobile Money uniquement)
export const acceptsManualPayment = (id: string | null | undefined): boolean => !!id && id in METHODS && METHODS[id as PaymentMethod].envKey !== null;

import type { PaymentMethod } from '@prisma/client';
import { getAutomaticOperator } from './operators.js';

// Moyens de paiement Mobile Money : le client envoie le montant au numéro marchand de la plateforme
// puis saisit la référence de la transaction, qu'un administrateur vérifie.
// Une carte bancaire nécessitera un prestataire de paiement (PSP) : ajouter une valeur à l'enum
// PaymentMethod puis un adaptateur ici (création de session + webhook de confirmation).

interface MethodConfig {
  label: string;
  envKey: string;
}

const METHODS: Record<PaymentMethod, MethodConfig> = {
  mvola: { label: 'MVola', envKey: 'PAYMENT_MVOLA_NUMBER' },
  orange_money: { label: 'Orange Money', envKey: 'PAYMENT_ORANGE_MONEY_NUMBER' },
  airtel_money: { label: 'Airtel Money', envKey: 'PAYMENT_AIRTEL_MONEY_NUMBER' },
};

export const PAYMENT_METHOD_IDS = Object.keys(METHODS) as [PaymentMethod, ...PaymentMethod[]];

export interface PaymentMethodInfo {
  id: PaymentMethod;
  label: string;
  number: string;
  accountName: string;
  /** Paiement instantané par l'API de l'opérateur disponible (sinon : envoi manuel + référence) */
  automatic: boolean;
}

function paymentAccountName(): string {
  return process.env.PAYMENT_ACCOUNT_NAME?.trim() || process.env.PLATFORM_NAME?.trim() || 'Tsena Pro';
}

// Seuls les moyens dont le numéro marchand est configuré sont proposés
export function getPaymentMethods(): PaymentMethodInfo[] {
  return PAYMENT_METHOD_IDS.flatMap((id) => {
    const number = process.env[METHODS[id].envKey]?.trim();
    return number
      ? [{ id, label: METHODS[id].label, number, accountName: paymentAccountName(), automatic: getAutomaticOperator(id) !== null }]
      : [];
  });
}

export function getPaymentMethod(id: string | null | undefined): PaymentMethodInfo | null {
  return getPaymentMethods().find((m) => m.id === id) ?? null;
}

export function paymentMethodLabel(id: string | null | undefined): string | null {
  return id && id in METHODS ? METHODS[id as PaymentMethod].label : null;
}

// Mêmes règles que le backend (backend/src/routes/auth.ts et checkout.ts), avec des messages pour l'écran.

import { z } from 'zod';
import type { PaymentMethodId } from './types';

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerCustomerSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis'),
  lastName: z.string().trim().min(1, 'Nom requis'),
  email: z.string().trim().email('E-mail invalide'),
  phone: z.string().trim().optional(),
  password: z.string().min(8, 'Au moins 8 caractères'),
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const guestSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis').max(100),
  email: z.string().trim().email('E-mail invalide').max(200),
  phone: z.string().trim().min(6, 'Téléphone requis').max(30),
});
export type GuestInput = z.infer<typeof guestSchema>;

export const shippingAddressSchema = z.object({
  street: z.string().trim().min(3, 'Adresse requise'),
  city: z.string().trim().min(2, 'Ville requise'),
  postalCode: z.string().trim().min(3, 'Code postal requis'),
  country: z.string().trim().optional(),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

/** Référence de transaction Mobile Money : 4 à 60 caractères (règle du serveur) */
export const REFERENCE_PATTERN = /^[A-Za-z0-9._\-/ ]{4,60}$/;

// Numéros malgaches par opérateur : MVola (034, 038), Orange Money (032, 037), Airtel Money (033)
const PHONE_PATTERNS: Record<PaymentMethodId, RegExp> = {
  mvola: /^03[48]\d{7}$/,
  orange_money: /^03[27]\d{7}$/,
  airtel_money: /^033\d{7}$/,
};

/** Numéro au format local « 03XXXXXXXX » (accepte « +261 34 … », « 00261… », espaces, points, tirets) */
export function normalizeMgPhone(input: string): string {
  let digits = input.replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+261')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('00261')) digits = '0' + digits.slice(5);
  else if (digits.startsWith('261') && digits.length === 12) digits = '0' + digits.slice(3);
  return digits;
}

export function isPayerNumber(provider: PaymentMethodId, input: string): boolean {
  return PHONE_PATTERNS[provider].test(normalizeMgPhone(input));
}

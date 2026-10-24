import { fetchAPI } from './config';

export interface RegisterCompanyData {
  companyName: string;
  legalName?: string;
  taxId: string;
  contactEmail: string;
  contactPhone?: string;
  user: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
}

interface RegisterCompanyResponse {
  success: boolean;
  message: string;
  companyId: string;
}

export async function registerCompany(data: RegisterCompanyData): Promise<RegisterCompanyResponse> {
  return fetchAPI<RegisterCompanyResponse>('/auth/register-company', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface RegisterCustomerData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export async function registerCustomer(data: RegisterCustomerData): Promise<{ success: boolean; message: string; userId: string }> {
  return fetchAPI('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---------- Connexion par téléphone (code SMS) ----------

// Erreur renvoyée par signIn('phone') pour un numéro inconnu : le formulaire demande alors le prénom et le nom
export const NEEDS_PROFILE = 'NeedsProfile';

export interface PhoneLoginStatus {
  enabled: boolean;
  /** Démonstration : aucun SMS envoyé, le code est renvoyé par requestPhoneCode */
  demo: boolean;
}

export function getPhoneLoginStatus(): Promise<PhoneLoginStatus> {
  return fetchAPI<PhoneLoginStatus>('/auth/phone');
}

export function requestPhoneCode(phone: string): Promise<{ success: boolean; expiresInSeconds: number; demoCode?: string }> {
  return fetchAPI('/auth/phone/request-code', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

// Compte créé par e-mail : ajoute un numéro vérifié pour se connecter ensuite par SMS
export function linkPhone(phone: string, code: string, token: string): Promise<{ success: boolean; verifiedPhone: string }> {
  return fetchAPI('/auth/phone/link', {
    method: 'POST',
    token,
    body: JSON.stringify({ phone, code }),
  });
}

export interface CurrentUser {
  id: string;
  email: string | null;
  phone: string | null;
  /** Numéro vérifié par SMS : connexion par téléphone possible */
  verifiedPhone: string | null;
  firstName: string;
  lastName: string;
  role: string;
}

export function getCurrentUser(token: string): Promise<{ user: CurrentUser }> {
  return fetchAPI('/auth/me', { token });
}

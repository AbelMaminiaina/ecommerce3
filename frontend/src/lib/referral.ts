// Lien de parrainage (https://…/?ref=TSENA-AB12CD) : le code est gardé dans le navigateur jusqu'à la commande,
// où il est proposé automatiquement. Stockage facultatif : navigation privée ou stockage bloqué = rien de gardé.

const KEY = 'tsena_referral';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CODE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

export function rememberReferral(raw: string | null): void {
  const code = raw?.trim().toUpperCase();
  if (!code || !CODE.test(code)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // stockage indisponible : le client pourra saisir le code à la main
  }
}

export function storedReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number };
    if (!code || !at || Date.now() - at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function forgetReferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien à faire
  }
}

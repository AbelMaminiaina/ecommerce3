// Conversion des montants en Ariary vers la devise d'un prestataire de paiement en ligne (Stripe, PayPal).
// Les prix du site sont en Ariary (entiers). PayPal n'accepte pas l'Ariary : le montant est converti avec un taux
// fixé dans la configuration (Ariary pour 1 unité de la devise), arrondi AU-DESSUS pour que la plateforme ne
// reçoive jamais moins que le prix affiché.

// Devises sans subdivision (le montant envoyé au prestataire est en unités entières)
const ZERO_DECIMAL = new Set(['MGA', 'JPY', 'KRW', 'XOF', 'XAF', 'XPF', 'CLP', 'VND', 'BIF', 'DJF', 'GNF', 'KMF', 'PYG', 'RWF', 'UGX', 'VUV']);

export const currencyDecimals = (currency: string): number => (ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2);

export interface Conversion {
  /** Code ISO 4217 en majuscules */
  currency: string;
  /** Ariary pour 1 unité de la devise (ignoré pour MGA) */
  rate: number | null;
}

// Taux lu dans l'environnement : nombre strictement positif (« 5000 », « 4 950,5 »), sinon null
export function parseRate(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const rate = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

// Montant en unités mineures de la devise (centimes d'euro…) ; null si la conversion est impossible (taux manquant)
export function fromAriary(amountAr: number, { currency, rate }: Conversion): number | null {
  if (currency === 'MGA') return amountAr;
  if (!rate) return null;
  const factor = 10 ** currencyDecimals(currency);
  // Arrondi au-dessus, avec une tolérance pour les erreurs de virgule flottante (5000 / 5000 * 100 = 100.00000000001)
  return Math.ceil(Number(((amountAr / rate) * factor).toFixed(6)));
}

// « 12.34 » (format décimal attendu par PayPal) à partir d'unités mineures
export const toDecimalString = (minor: number, currency: string): string => {
  const decimals = currencyDecimals(currency);
  return (minor / 10 ** decimals).toFixed(decimals);
};

// Unités mineures à partir de « 12.34 » ; null si illisible
export function fromDecimalString(value: unknown, currency: string): number | null {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return null;
  return Math.round(Number(value) * 10 ** currencyDecimals(currency));
}

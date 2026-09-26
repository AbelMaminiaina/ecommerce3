// Briques communes aux clients d'API des opérateurs Mobile Money (MVola, Orange Money, Airtel Money).

export class OperatorError extends Error {
  constructor(
    message: string,
    /** Statut HTTP renvoyé par l'opérateur (absent pour une erreur réseau ou un délai dépassé) */
    public readonly status?: number,
    /** Vrai si réessayer plus tard peut réussir (erreur réseau, 5xx, 429) */
    public readonly retriable = false
  ) {
    super(message);
    this.name = 'OperatorError';
  }
}

export type FetchFn = typeof fetch;

const REQUEST_TIMEOUT_MS = 15_000;

// Appel HTTP avec délai maximal ; toute erreur devient une OperatorError. Renvoie le JSON (ou null si le corps est vide).
export async function operatorFetch(
  fetchFn: FetchFn,
  url: string,
  init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
  label: string
): Promise<any> {
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new OperatorError(timedOut ? `${label} ne répond pas (délai dépassé)` : `${label} est injoignable`, undefined, true);
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const detail =
      data?.ErrorDescription ?? data?.errorDescription ?? data?.error_description ?? data?.description ?? data?.message ?? data?.error;
    throw new OperatorError(
      `${label} a répondu ${res.status}${detail ? ` : ${String(detail).slice(0, 200)}` : ''}`,
      res.status,
      res.status >= 500 || res.status === 429
    );
  }
  return data;
}

// Adresse (HTTP ou HTTPS) absolue et bien formée ; sert à valider une URL de paiement fournie par un opérateur
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

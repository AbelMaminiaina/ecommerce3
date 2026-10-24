import { fetchAPI } from './config';
import type { Product } from '@/types';

export interface AdvisorResponse {
  message: string;
  source: 'ai' | 'fallback';
  products: Product[];
}

// Identifiant de ce navigateur pour la limite de questions du conseiller : beaucoup de clients partagent la même
// adresse IP (opérateurs mobiles), la limite ne peut pas porter sur l'adresse seule. Aléatoire, sans donnée personnelle.
const VISITOR_KEY = 'tsena_visitor';

function visitorId(): string | undefined {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = `web-${crypto.randomUUID()}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return undefined; // stockage indisponible : limite par adresse IP
  }
}

// Le backend renvoie un message lisible en cas d'erreur (limite atteinte, question invalide…)
export function askAdvisor(question: string): Promise<AdvisorResponse> {
  const id = visitorId();
  return fetchAPI<AdvisorResponse>('/advisor', {
    method: 'POST',
    body: JSON.stringify({ question }),
    ...(id ? { headers: { 'X-Visitor-Id': id } } : {}),
  });
}

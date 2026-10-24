import { fetchAPI } from './config';
import type { Product } from '@/types';

export interface AdvisorResponse {
  message: string;
  source: 'ai' | 'fallback';
  products: Product[];
}

// Le backend renvoie un message lisible en cas d'erreur (limite atteinte, question invalide…)
export function askAdvisor(question: string): Promise<AdvisorResponse> {
  return fetchAPI<AdvisorResponse>('/advisor', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

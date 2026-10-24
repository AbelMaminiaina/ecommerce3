import { useMutation } from '@tanstack/react-query';
import { advisorApi } from '@tsena/shared';
import { api } from '../../lib/api';

/**
 * Conseiller IA : question libre -> conseil et produits du catalogue (Mistral, puis Gemini, puis recherche par
 * mots-clés côté serveur). Mutation plutôt que requête : chaque question est une action du client, jamais mise en
 * cache ni gardée hors connexion (le serveur met lui-même les réponses en cache).
 */
export const useAskAdvisor = () => useMutation({ mutationFn: (question: string) => advisorApi.ask(api, question) });

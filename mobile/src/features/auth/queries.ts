import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi, promoApi } from '@tsena/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../queryKeys';

/** Connexion par SMS proposée par le serveur ? (SMS configurés, ou mode démonstration) */
export const usePhoneLoginStatus = () =>
  useQuery({ queryKey: queryKeys.auth.phone(), queryFn: () => authApi.phoneStatus(api), staleTime: 10 * 60 * 1000 });

/** Envoie un code à 6 chiffres par SMS (connexion, ou confirmation de la suppression du compte) */
export const useRequestPhoneCode = () => useMutation({ mutationFn: (phone: string) => authApi.requestPhoneCode(api, phone) });

/** Parrainage : code personnel, lien, filleuls et bons d'achat gagnés */
export const useReferral = () => useQuery({ queryKey: queryKeys.referral(), queryFn: () => promoApi.referral(api) });

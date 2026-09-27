import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, type CheckoutInput } from '@tsena/shared';
import { api } from '../../lib/api';
import { useAuth } from '../auth/store';
import { queryKeys } from '../queryKeys';

/** Commandes du client connecté */
export function useMyOrders() {
  const signedIn = useAuth((s) => s.status === 'signed-in');
  return useQuery({ queryKey: queryKeys.orders.mine(), queryFn: () => ordersApi.mine(api), enabled: signedIn });
}

/** Passage de commande ; la liste « Mes commandes » est rafraîchie ensuite */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CheckoutInput) => ordersApi.create(api, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() }),
  });
}

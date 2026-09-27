import { useState } from 'react';
import {
  guestSchema,
  shippingAddressSchema,
  summarizeCart,
  type DeliveryMethod,
  type PaymentMethodId,
} from '@tsena/shared';
import { useAuth, useTieredPricing } from '../auth/store';
import { useCart } from '../cart/store';
import { useCreateOrder } from '../orders/queries';
import { useGuestOrders } from '../payment/guestOrders';
import { usePaymentMethods } from '../payment/usePayment';

export const DELIVERY_METHODS: DeliveryMethod[] = ['standard', 'express', 'retrait'];

type Errors = Record<string, string | undefined>;

// Premier message de chaque champ d'une validation zod
const fieldErrors = (issues: { path: PropertyKey[]; message: string }[]): Errors =>
  Object.fromEntries(issues.map((i) => [String(i.path[0]), i.message]).reverse());

/**
 * Formulaire de commande : livraison, adresse, coordonnées (commande sans compte), moyen de paiement.
 * Valide avec les règles partagées (@tsena/shared), envoie la commande, vide le panier puis appelle
 * `onOrdered` avec le numéro de commande (l'écran choisit où naviguer).
 */
export function useCheckoutForm(onOrdered: (orderNumber: string) => void) {
  const { items, clear } = useCart();
  const signedIn = useAuth((s) => s.status === 'signed-in');
  const tiered = useTieredPricing();
  const rememberGuest = useGuestOrders((s) => s.remember);
  const methods = usePaymentMethods();
  const order = useCreateOrder();

  const [delivery, setDelivery] = useState<DeliveryMethod>('standard');
  const [method, setMethod] = useState<PaymentMethodId | null>(null);
  const [address, setAddress] = useState({ street: '', city: '', postalCode: '' });
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  // Premier moyen proposé tant que le client n'a pas choisi
  const selectedMethod = method ?? methods.data?.[0]?.id ?? null;
  const summary = summarizeCart(items, delivery, tiered);

  const submit = () => {
    const next: Errors = {};
    const addr = delivery === 'retrait' ? null : shippingAddressSchema.safeParse(address);
    if (addr && !addr.success) Object.assign(next, fieldErrors(addr.error.issues));
    const who = signedIn ? null : guestSchema.safeParse(guest);
    if (who && !who.success) Object.assign(next, fieldErrors(who.error.issues));
    if (!selectedMethod) next.method = 'Choisissez un moyen de paiement';
    setErrors(next);
    if (Object.keys(next).length > 0 || !selectedMethod) return;

    order.mutate(
      {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        deliveryMethod: delivery,
        paymentMethod: selectedMethod,
        shippingAddress: addr?.success ? { ...addr.data, country: 'Madagascar' } : undefined,
        guest: who?.success ? who.data : undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          const orderNumber = result.orderNumber ?? result.orders?.[0]?.orderNumber;
          if (!orderNumber) return;
          // Sans compte, l'e-mail saisi sert à suivre le paiement de cette commande
          if (!signedIn) rememberGuest(orderNumber, guest.email.trim());
          clear();
          onOrdered(orderNumber);
        },
      }
    );
  };

  return {
    signedIn,
    /** Panier vide (et pas de commande en cours d'envoi) : rien à commander */
    empty: items.length === 0 && !order.isSuccess,
    summary,
    delivery,
    setDelivery,
    methods,
    selectedMethod,
    setMethod,
    address,
    setAddress,
    guest,
    setGuest,
    notes,
    setNotes,
    errors,
    submit,
    submitting: order.isPending,
    submitError: order.error,
  };
}

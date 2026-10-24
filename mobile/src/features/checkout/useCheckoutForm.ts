import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  findShippingZone,
  guestSchema,
  isServedCity,
  shippingAddressSchema,
  shippingApi,
  summarizeCart,
  type DeliveryMethod,
  type PaymentMethodId,
} from '@tsena/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../queryKeys';
import { useAuth, useTieredPricing } from '../auth/store';
import { useCart } from '../cart/store';
import { useCreateOrder } from '../orders/queries';
import { useGuestOrders } from '../payment/guestOrders';
import { usePaymentMethods } from '../payment/usePayment';

/** À domicile (standard / express à Antananarivo, province ailleurs), point relais, ou retrait sur place */
export type DeliveryMode = 'home' | 'relais' | 'retrait';
export const SPEEDS = ['standard', 'express'] as const;

/** Villes desservies à domicile, zones de province et points relais (sans elles : standard / express comme avant) */
export const useShippingOptions = () =>
  useQuery({ queryKey: queryKeys.shipping.options(), queryFn: () => shippingApi.options(api), staleTime: 10 * 60 * 1000 });

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
  const paymentMethods = usePaymentMethods();
  const shipping = useShippingOptions();
  const order = useCreateOrder();

  const [mode, setMode] = useState<DeliveryMode>('home');
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('standard');
  const [pickupPointId, setPickupPointId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethodId | null>(null);
  const [address, setAddress] = useState({ street: '', city: '', postalCode: '' });
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  // La ville décide du mode à domicile : standard / express à Antananarivo et environs, province ailleurs
  const options = shipping.data;
  const city = address.city.trim();
  const isLocalCity = !options || !city || isServedCity(city, options.localCities);
  const zone = options && city && !isLocalCity ? findShippingZone(city, options.zones) : null;
  const pickupPoint = options?.pickupPoints.find((p) => p.id === pickupPointId) ?? null;
  const delivery: DeliveryMethod = mode === 'home' ? (isLocalCity ? speed : 'province') : mode;

  // Paiement à la livraison : réservé aux clients connectés (refusé par le serveur sinon)
  const methods = {
    ...paymentMethods,
    data: paymentMethods.data?.filter((m) => signedIn || m.id !== 'cash_on_delivery'),
  };
  // Premier moyen proposé tant que le client n'a pas choisi
  const selectedMethod = method ?? methods.data?.[0]?.id ?? null;
  const summary = summarizeCart(items, delivery, tiered, { provincePrice: zone?.price, relayFee: pickupPoint?.fee });

  const submit = () => {
    const next: Errors = {};
    const addr = mode === 'home' ? shippingAddressSchema.safeParse(address) : null;
    if (addr && !addr.success) Object.assign(next, fieldErrors(addr.error.issues));
    if (addr?.success && !isLocalCity && !zone) next.city = "Livraison pas encore proposée dans cette ville : choisissez un point relais";
    if (mode === 'relais' && !pickupPoint) next.pickupPoint = 'Choisissez un point relais';
    const who = signedIn ? null : guestSchema.safeParse(guest);
    if (who && !who.success) Object.assign(next, fieldErrors(who.error.issues));
    if (!selectedMethod) next.method = 'Choisissez un moyen de paiement';
    setErrors(next);
    if (Object.keys(next).length > 0 || !selectedMethod) return;

    order.mutate(
      {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        deliveryMethod: delivery,
        ...(mode === 'relais' && pickupPoint ? { pickupPointId: pickupPoint.id } : {}),
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
    mode,
    setMode,
    speed,
    setSpeed,
    isLocalCity,
    zone,
    pickupPoints: options?.pickupPoints ?? [],
    pickupPointId,
    setPickupPointId,
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

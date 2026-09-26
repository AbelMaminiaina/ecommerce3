import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DELIVERY_LABELS,
  formatPrice,
  guestSchema,
  ordersApi,
  paymentsApi,
  shippingAddressSchema,
  summarizeCart,
  type CheckoutInput,
  type DeliveryMethod,
  type PaymentMethodId,
} from '@tsena/shared';
import { Body, Button, Card, ErrorText, Message, Row, TextField, Title, errorMessage, styles as ui } from '../../components/ui';
import { useAuth, useTieredPricing } from '../../features/auth/store';
import { useCart } from '../../features/cart/store';
import { useGuestOrders } from '../../features/payment/guestOrders';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme';

const DELIVERY_METHODS: DeliveryMethod[] = ['standard', 'express', 'retrait'];
type Errors = Record<string, string | undefined>;

// Premier message de chaque champ d'une validation zod
const fieldErrors = (issues: { path: (string | number)[]; message: string }[]): Errors =>
  Object.fromEntries(issues.map((i) => [String(i.path[0]), i.message]).reverse());

function Choice({ selected, onPress, title, detail }: { selected: boolean; onPress: () => void; title: string; detail?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[styles.choice, selected && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}
    >
      <View style={[styles.radio, selected && { borderColor: colors.primary }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {detail ? <Body muted style={{ fontSize: 13 }}>{detail}</Body> : null}
      </View>
    </Pressable>
  );
}

export default function Checkout() {
  const { items, clear } = useCart();
  const signedIn = useAuth((s) => s.status === 'signed-in');
  const tiered = useTieredPricing();
  const rememberGuest = useGuestOrders((s) => s.remember);

  const [delivery, setDelivery] = useState<DeliveryMethod>('standard');
  const [method, setMethod] = useState<PaymentMethodId | null>(null);
  const [address, setAddress] = useState({ street: '', city: '', postalCode: '' });
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => paymentsApi.methods(api) });
  const selectedMethod = method ?? methods.data?.[0]?.id ?? null;

  const order = useMutation({
    mutationFn: (data: CheckoutInput) => ordersApi.create(api, data),
    onSuccess: (result) => {
      const orderNumber = result.orderNumber ?? result.orders?.[0]?.orderNumber;
      if (!orderNumber) return;
      if (!signedIn) rememberGuest(orderNumber, guest.email.trim());
      clear();
      router.replace({ pathname: '/commande/[numero]', params: { numero: orderNumber } });
    },
  });

  if (items.length === 0 && !order.isSuccess) {
    return <Message title="Votre panier est vide" action={<Button title="Voir le catalogue" onPress={() => router.navigate('/catalogue')} />} />;
  }

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

    order.mutate({
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      deliveryMethod: delivery,
      paymentMethod: selectedMethod,
      shippingAddress: addr?.success ? { ...addr.data, country: 'Madagascar' } : undefined,
      guest: who?.success ? who.data : undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Commande' }} />
      <ScrollView contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
        {!signedIn ? (
          <Card>
            <Title style={styles.section}>Vos coordonnées</Title>
            <Body muted style={{ marginBottom: 12, fontSize: 13 }}>
              Commande sans compte.{' '}
              <Text style={{ color: colors.primary }} onPress={() => router.push('/auth/connexion')}>
                Se connecter
              </Text>
            </Body>
            <TextField label="Nom complet" value={guest.name} onChangeText={(name) => setGuest({ ...guest, name })} error={errors.name} autoComplete="name" />
            <TextField
              label="E-mail"
              value={guest.email}
              onChangeText={(email) => setGuest({ ...guest, email })}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <TextField
              label="Téléphone"
              value={guest.phone}
              onChangeText={(phone) => setGuest({ ...guest, phone })}
              error={errors.phone}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          </Card>
        ) : null}

        <Card style={{ gap: 8 }}>
          <Title style={styles.section}>Livraison</Title>
          {DELIVERY_METHODS.map((m) => (
            <Choice key={m} selected={delivery === m} onPress={() => setDelivery(m)} title={DELIVERY_LABELS[m].label} detail={DELIVERY_LABELS[m].delay} />
          ))}
          {delivery !== 'retrait' ? (
            <View style={{ marginTop: 8 }}>
              <TextField label="Adresse" value={address.street} onChangeText={(street) => setAddress({ ...address, street })} error={errors.street} autoComplete="street-address" />
              <TextField label="Ville" value={address.city} onChangeText={(city) => setAddress({ ...address, city })} error={errors.city} />
              <TextField
                label="Code postal"
                value={address.postalCode}
                onChangeText={(postalCode) => setAddress({ ...address, postalCode })}
                error={errors.postalCode}
                keyboardType="number-pad"
                autoComplete="postal-code"
              />
            </View>
          ) : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <Title style={styles.section}>Paiement Mobile Money</Title>
          {methods.isLoading ? <Body muted>Chargement…</Body> : null}
          {methods.error ? <ErrorText>{errorMessage(methods.error)}</ErrorText> : null}
          {methods.data?.map((m) => (
            <Choice
              key={m.id}
              selected={selectedMethod === m.id}
              onPress={() => setMethod(m.id)}
              title={m.label}
              detail={m.automatic ? 'Paiement instantané' : `Envoi au ${m.number} puis saisie de la référence`}
            />
          ))}
          <ErrorText>{errors.method}</ErrorText>
        </Card>

        <TextField label="Note pour le vendeur (facultatif)" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />

        <Card style={{ gap: 4 }}>
          <Row label="Sous-total" value={formatPrice(summary.subtotal)} />
          <Row label="Livraison" value={summary.shipping ? formatPrice(summary.shipping) : 'Offerte'} />
          <Row label="Total à payer" value={formatPrice(summary.total)} strong />
          {summary.groups.length > 1 ? (
            <Body muted style={{ fontSize: 13 }}>Une commande par vendeur ({summary.groups.length}), un seul paiement.</Body>
          ) : null}
          <Body muted style={{ fontSize: 12, marginTop: 4 }}>Le montant définitif est confirmé par le serveur.</Body>
        </Card>

        <ErrorText>{errorMessage(order.error)}</ErrorText>
        <Button title="Valider et payer" loading={order.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 17, marginBottom: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 },
  choiceTitle: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});

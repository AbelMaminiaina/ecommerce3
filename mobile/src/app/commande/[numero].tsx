import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  REFERENCE_PATTERN,
  formatDate,
  formatPrice,
  isPayerNumber,
  type OrderStatus,
} from '@tsena/shared';
import { Body, Button, Card, ErrorText, Loading, Message, Row, TextField, Title, errorMessage, styles as ui } from '../../components/ui';
import { useAuth } from '../../features/auth/store';
import { useGuestOrders } from '../../features/payment/guestOrders';
import { usePayment } from '../../features/payment/usePayment';
import { colors } from '../../theme';

export default function OrderPayment() {
  const { numero } = useLocalSearchParams<{ numero: string }>();
  const signedIn = useAuth((s) => s.status === 'signed-in');
  const guestEmail = useGuestOrders((s) => s.emails[numero]);
  const email = signedIn ? undefined : guestEmail;
  const payment = usePayment(numero, email);

  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  if (!signedIn && !guestEmail) {
    return (
      <Message
        title="Connectez-vous pour suivre cette commande"
        text="Le suivi d’une commande passée sur un autre appareil demande votre compte."
        action={<Button title="Se connecter" onPress={() => router.push('/auth/connexion')} />}
      />
    );
  }
  if (payment.loading) return <Loading />;
  const s = payment.summary;
  if (!s) {
    return (
      <Message
        title="Commande introuvable"
        text={errorMessage(payment.error) ?? undefined}
        action={<Button title="Réessayer" onPress={() => payment.refresh()} />}
      />
    );
  }

  const paid = s.paymentStatus === 'paid';
  const cancelled = s.orders.every((o) => o.status === 'cancelled');
  const canPay = !paid && !cancelled && (s.paymentStatus === 'awaiting' || s.paymentStatus === 'rejected');
  const instant = payment.instant;

  const startInstant = () => {
    if (instant?.flow === 'push') {
      if (!isPayerNumber(instant.provider, phone)) {
        setPhoneError(`Numéro ${instant.label} attendu (${instant.phonePrefixes})`);
        return;
      }
      setPhoneError(null);
      payment.start.mutate(phone);
    } else {
      payment.start.mutate(undefined);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={ui.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => payment.refresh()} tintColor={colors.primary} />}
    >
      <Stack.Screen options={{ title: 'Paiement', headerBackVisible: false, headerLeft: () => null }} />

      <Card style={{ gap: 4 }}>
        <Title style={{ fontSize: 17 }}>{paid ? 'Paiement confirmé' : cancelled ? 'Commande annulée' : 'Commande enregistrée'}</Title>
        <Body style={{ color: paid ? colors.primary : colors.text }}>{PAYMENT_STATUS_LABELS[s.paymentStatus]}</Body>
        {s.demo ? <Body muted style={{ fontSize: 13 }}>Démonstration : aucun argent réel n’est débité.</Body> : null}
        {s.cancelReason ? <Body style={{ color: colors.danger }}>{s.cancelReason}</Body> : null}
        {canPay && s.expiresAt ? <Body muted style={{ fontSize: 13 }}>À payer avant le {formatDate(s.expiresAt)}.</Body> : null}
      </Card>

      <Card style={{ gap: 2 }}>
        {s.orders.map((o) => (
          <Row
            key={o.orderNumber}
            label={`${o.orderNumber}${o.sellerName ? ` · ${o.sellerName}` : ''}\n${ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}`}
            value={formatPrice(o.total)}
          />
        ))}
        <Row label="Total" value={formatPrice(s.totalAmount)} strong />
      </Card>

      {canPay && instant ? (
        <Card style={{ gap: 10 }}>
          <Title style={{ fontSize: 17 }}>Payer avec {instant.label}</Title>
          {payment.waiting ? (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={colors.primary} />
              <Body style={{ textAlign: 'center' }}>
                {instant.flow === 'push'
                  ? `Confirmez la demande reçue sur le ${payment.attempt?.payerPhone ?? 'téléphone'} avec votre code secret.`
                  : 'Terminez le paiement sur la page d’Orange Money.'}
              </Body>
              {instant.flow === 'redirect' ? <Button variant="outline" title="Rouvrir la page de paiement" onPress={() => payment.resume()} /> : null}
            </View>
          ) : (
            <>
              {instant.flow === 'push' ? (
                <TextField
                  label={`Numéro ${instant.label}`}
                  placeholder={instant.phonePlaceholder}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  error={phoneError ?? undefined}
                />
              ) : (
                <Body muted>Vous serez dirigé vers la page sécurisée d’Orange Money, puis ramené ici.</Body>
              )}
              {payment.lastFailure ? <ErrorText>{payment.lastFailure}</ErrorText> : null}
              <ErrorText>{errorMessage(payment.start.error)}</ErrorText>
              <Button title={`Payer ${formatPrice(s.totalAmount)}`} loading={payment.start.isPending} onPress={startInstant} />
            </>
          )}
        </Card>
      ) : null}

      {payment.inReview ? (
        <Card>
          <Body>Votre paiement a été reçu mais demande une vérification par notre équipe. Vous serez prévenu.</Body>
        </Card>
      ) : null}

      {canPay && !instant && s.number ? (
        <Card style={{ gap: 8 }}>
          <Title style={{ fontSize: 17 }}>Paiement {s.methodLabel}</Title>
          <Body>
            Envoyez <Text style={ui.strong}>{formatPrice(s.totalAmount)}</Text> au <Text style={ui.strong}>{s.number}</Text> ({s.accountName}),
            puis saisissez la référence de la transaction.
          </Body>
          {s.rejectionReason ? <ErrorText>Paiement refusé : {s.rejectionReason}</ErrorText> : null}
          <TextField label="Référence de la transaction" value={reference} onChangeText={setReference} autoCapitalize="characters" />
          <TextField label="Numéro utilisé pour payer" value={manualPhone} onChangeText={setManualPhone} keyboardType="phone-pad" />
          <ErrorText>{errorMessage(payment.submitReference.error)}</ErrorText>
          <Button
            title="Envoyer la référence"
            disabled={!REFERENCE_PATTERN.test(reference.trim()) || manualPhone.trim().length < 6}
            loading={payment.submitReference.isPending}
            onPress={() => payment.submitReference.mutate({ reference, payerPhone: manualPhone })}
          />
        </Card>
      ) : null}

      {s.paymentStatus === 'submitted' ? (
        <Card>
          <Body>Référence {s.reference} reçue : notre équipe vérifie votre paiement.</Body>
        </Card>
      ) : null}

      <Button variant="outline" title="Continuer mes achats" onPress={() => router.dismissTo('/')} />
    </ScrollView>
  );
}

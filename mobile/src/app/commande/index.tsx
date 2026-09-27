import { Stack, router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DELIVERY_LABELS, formatPrice } from '@tsena/shared';
import { Body, Button, Card, ErrorText, Message, Row, TextField, Title, errorMessage, styles as ui } from '../../components/ui';
import { DELIVERY_METHODS, useCheckoutForm } from '../../features/checkout/useCheckoutForm';
import { colors, fonts } from '../../theme';

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
  const form = useCheckoutForm((orderNumber) =>
    router.replace({ pathname: '/commande/[numero]', params: { numero: orderNumber } })
  );
  const { signedIn, summary, delivery, setDelivery, methods, selectedMethod, setMethod, address, setAddress } = form;
  const { guest, setGuest, notes, setNotes, errors, submit } = form;

  if (form.empty) {
    return <Message title="Votre panier est vide" action={<Button title="Voir le catalogue" onPress={() => router.navigate('/catalogue')} />} />;
  }

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

        <ErrorText>{errorMessage(form.submitError)}</ErrorText>
        <Button title="Valider et payer" loading={form.submitting} onPress={submit} />
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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { formatDate, ordersApi, type Order } from '@tsena/shared';
import { Body, Button, Card, ErrorText, TextField, Title, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { colors } from '../../theme';
import { queryKeys } from '../queryKeys';

const TITLES = {
  protected: 'Paiement garanti',
  received: 'Réception confirmée',
  disputed: 'Problème signalé',
  refunded: 'Remboursement accordé',
} as const;

// Paiement garanti d'une commande : le vendeur n'est payé qu'une fois la réception confirmée. L'acheteur
// confirme la réception, ou signale un problème pendant le délai (même règles que « Mon compte » sur le site).
export function ProtectionCard({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });

  const confirm = useMutation({ mutationFn: () => ordersApi.confirmReceipt(api, order.id), onSuccess: refresh });
  const dispute = useMutation({
    mutationFn: () => ordersApi.openDispute(api, order.id, reason.trim()),
    onSuccess: () => {
      setReporting(false);
      refresh();
    },
  });

  const state = order.protection ?? 'none';
  if (state === 'none') return null;

  const askConfirm = () =>
    Alert.alert('Confirmer la réception ?', 'Le vendeur sera payé. Vous ne pourrez plus signaler de problème.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Oui, tout est en ordre', onPress: () => confirm.mutate() },
    ]);

  const sendDispute = () => {
    if (reason.trim().length < 10) return setReasonError('Décrivez le problème en quelques mots (10 caractères minimum)');
    setReasonError(null);
    dispute.mutate();
  };

  const tone = state === 'disputed' ? colors.danger : state === 'protected' ? colors.primary : '#16a34a';

  return (
    <Card style={{ gap: 8, borderColor: tone, borderWidth: 1 }}>
      <Title style={{ fontSize: 16, color: tone }}>
        {TITLES[state]} · {order.orderNumber}
      </Title>
      <Body muted style={{ fontSize: 13 }}>
        {state === 'protected' &&
          (order.deliveredAt
            ? `Le vendeur ne sera payé qu’après votre confirmation.${order.disputeDeadline ? ` Un problème ? Signalez-le avant le ${formatDate(order.disputeDeadline)}.` : ''}`
            : 'Votre argent est gardé par Tsena : le vendeur n’est payé qu’une fois votre commande reçue.')}
        {state === 'received' && 'Merci ! Le vendeur va recevoir son paiement.'}
        {state === 'disputed' && 'Notre équipe examine votre signalement et revient vers vous rapidement.'}
        {state === 'refunded' && 'Vous êtes remboursé sur le moyen de paiement utilisé (ou en Mobile Money).'}
      </Body>
      {order.disputeReason && (state === 'disputed' || state === 'refunded') ? (
        <Body style={{ fontStyle: 'italic', fontSize: 13 }}>« {order.disputeReason} »</Body>
      ) : null}
      {order.disputeNote ? <Body style={{ fontSize: 13 }}>Réponse de l’équipe : {order.disputeNote}</Body> : null}

      {reporting ? (
        <View>
          <TextField
            label="Que s’est-il passé ?"
            placeholder="Colis abîmé, produit manquant, article différent…"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={1000}
            error={reasonError ?? undefined}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <ErrorText>{errorMessage(dispute.error)}</ErrorText>
          <Button title="Envoyer le signalement" loading={dispute.isPending} onPress={sendDispute} />
          <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 10 }} onPress={() => setReporting(false)}>
            Annuler
          </Text>
        </View>
      ) : (
        <>
          {order.canConfirmReceipt ? <Button title="J’ai bien reçu ma commande" loading={confirm.isPending} onPress={askConfirm} /> : null}
          {order.canOpenDispute ? (
            <Text style={{ color: colors.danger, textAlign: 'center', paddingVertical: 4 }} onPress={() => setReporting(true)}>
              Signaler un problème
            </Text>
          ) : null}
          <ErrorText>{errorMessage(confirm.error)}</ErrorText>
        </>
      )}
    </Card>
  );
}

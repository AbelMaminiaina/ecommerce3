import { Stack } from 'expo-router';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { formatDate, formatPrice } from '@tsena/shared';
import { Body, Button, Card, ErrorText, Loading, Title, errorMessage, styles as ui } from '../../components/ui';
import { useReferral } from '../../features/auth/queries';
import { colors, fonts, radius } from '../../theme';

const REWARD_STATUS = { available: 'À utiliser', used: 'Utilisé', expired: 'Expiré' } as const;

// Parrainage : code personnel, partage (WhatsApp, Messenger, SMS… via le partage du téléphone), bons gagnés
export default function Referral() {
  const referral = useReferral();

  if (referral.isLoading) return <Loading />;
  const info = referral.data;

  const offer = info ? `${info.discountPercent} %${info.discountMax ? ` (jusqu'à ${formatPrice(info.discountMax)})` : ''}` : '';
  const share = () => {
    if (!info) return;
    // Partage natif : l'utilisateur choisit WhatsApp, Messenger, SMS… ; le code reste lisible même sans le lien
    Share.share({
      message: `Je commande sur Tsena Pro : profite de -${offer} sur ta première commande avec mon code ${info.code} 👉 ${info.link}`,
    }).catch(() => undefined);
  };

  return (
    <ScrollView
      contentContainerStyle={ui.screen}
      refreshControl={<RefreshControl refreshing={referral.isRefetching} onRefresh={() => referral.refetch()} tintColor={colors.primary} />}
    >
      <Stack.Screen options={{ title: 'Parrainage' }} />
      <ErrorText>{referral.error ? errorMessage(referral.error) : null}</ErrorText>

      {info && !info.enabled ? <Body muted>Le parrainage n’est pas proposé pour le moment.</Body> : null}

      {info?.enabled ? (
        <>
          <Card style={{ gap: 10 }}>
            <Title style={{ fontSize: 18 }}>Invitez vos proches, gagnez {formatPrice(info.rewardAmount)}</Title>
            <Body muted>
              Vos filleuls obtiennent -{offer} sur leur première commande.
              {info.rewardAmount > 0 ? ` Dès qu’elle est payée, vous recevez un bon d’achat de ${formatPrice(info.rewardAmount)}.` : ''}
            </Body>
            <View style={styles.code}>
              <Text style={styles.codeLabel}>Votre code</Text>
              <Text selectable style={styles.codeValue}>
                {info.code}
              </Text>
            </View>
            <Button title="Partager mon code" icon="share-social-outline" onPress={share} />
          </Card>

          <Card style={{ gap: 4 }}>
            <Body>
              {info.referrals} filleul{info.referrals > 1 ? 's' : ''} ayant commandé
            </Body>
            {info.rewards.length === 0 ? <Body muted style={{ fontSize: 13 }}>Vos bons d’achat apparaîtront ici.</Body> : null}
            {info.rewards.map((reward) => (
              <View key={reward.code} style={styles.reward}>
                <View style={{ flex: 1 }}>
                  <Text selectable style={styles.rewardCode}>
                    {reward.code}
                  </Text>
                  <Body muted style={{ fontSize: 13 }}>
                    {formatPrice(reward.amount)}
                    {reward.endsAt && reward.status === 'available' ? ` · jusqu’au ${formatDate(reward.endsAt)}` : ''}
                  </Body>
                </View>
                <Text style={[styles.rewardStatus, reward.status !== 'available' && { color: colors.muted }]}>
                  {REWARD_STATUS[reward.status]}
                </Text>
              </View>
            ))}
            {info.rewards.some((r) => r.status === 'available') ? (
              <Body muted style={{ fontSize: 12, marginTop: 4 }}>Saisissez le code du bon dans « Code promo » au moment de commander.</Body>
            ) : null}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  code: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, padding: 12, alignItems: 'center', gap: 2 },
  codeLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  codeValue: { fontFamily: fonts.heading, fontSize: 22, letterSpacing: 2, color: colors.primary },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  rewardCode: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  rewardStatus: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#16a34a' },
});

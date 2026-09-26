import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatDate, formatPrice, ordersApi } from '@tsena/shared';
import { Body, Button, Card, ErrorText, Message, Title, errorMessage } from '../../components/ui';
import { useAuth } from '../../features/auth/store';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme';

const COMPANY_STATUS: Record<string, string> = {
  pending: 'Entreprise en cours de validation',
  approved: 'Entreprise approuvée : prix dégressifs actifs',
  rejected: 'Entreprise refusée',
  suspended: 'Entreprise suspendue',
};

export default function Account() {
  const { status, user, company, logout } = useAuth();
  const signedIn = status === 'signed-in';

  const orders = useQuery({ queryKey: ['orders', 'mine'], queryFn: () => ordersApi.mine(api), enabled: signedIn && user?.role !== 'platform_admin' });

  if (!signedIn) {
    return (
      <Message
        title="Mon compte"
        text="Connectez-vous pour suivre vos commandes et payer plus vite."
        action={
          <View style={{ gap: 10 }}>
            <Button title="Se connecter" onPress={() => router.push('/auth/connexion')} />
            <Button variant="outline" title="Créer un compte" onPress={() => router.push('/auth/inscription')} />
          </View>
        }
      />
    );
  }

  const confirmLogout = () =>
    Alert.alert('Se déconnecter ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
    ]);

  return (
    <FlatList
      data={orders.data ?? []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshing={orders.isRefetching}
      onRefresh={() => orders.refetch()}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Card>
            <Title>{user ? `${user.firstName} ${user.lastName}` : 'Mon compte'}</Title>
            {user ? <Body muted>{user.email}</Body> : null}
            {company ? (
              <Body style={{ marginTop: 6 }}>
                {company.name} · {COMPANY_STATUS[company.status] ?? company.status}
              </Body>
            ) : null}
          </Card>
          <Title style={{ fontSize: 17 }}>Mes commandes</Title>
          <ErrorText>{orders.error ? errorMessage(orders.error) : null}</ErrorText>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: '/commande/[numero]', params: { numero: item.orderNumber } }} asChild>
          <Pressable>
            <Card style={{ gap: 2 }}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                <Text style={styles.total}>{formatPrice(item.total)}</Text>
              </View>
              <Body muted style={{ fontSize: 13 }}>
                {formatDate(item.createdAt)} · {item.items.length} article(s)
              </Body>
              <Body style={{ fontSize: 13 }}>
                {ORDER_STATUS_LABELS[item.status]}
                {item.paymentStatus ? ` · ${PAYMENT_STATUS_LABELS[item.paymentStatus]}` : ''}
              </Body>
            </Card>
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={orders.isLoading ? <Body muted>Chargement…</Body> : <Body muted>Aucune commande pour le moment.</Body>}
      ListFooterComponent={
        <View style={{ gap: 10, marginTop: 12 }}>
          <Button variant="outline" title="Se déconnecter" onPress={confirmLogout} />
          <Pressable onPress={() => router.push('/compte/supprimer')} accessibilityRole="button" style={{ padding: 12 }}>
            <Text style={styles.delete}>Supprimer mon compte</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  orderNumber: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 14 },
  total: { fontFamily: fonts.heading, color: colors.text, fontSize: 15 },
  delete: { color: colors.danger, textAlign: 'center', fontFamily: fonts.body },
});

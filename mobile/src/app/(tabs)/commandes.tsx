import { Link, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatDate, formatPrice, type Order } from '@tsena/shared';
import { ProductImage } from '../../components/ProductImage';
import { Body, Button, ErrorText, Message, errorMessage } from '../../components/ui';
import { useAuth } from '../../features/auth/store';
import { useMyOrders } from '../../features/orders/queries';
import { colors, fonts, radius } from '../../theme';

const STATUS_TONE: Record<Order['status'], string> = {
  pending: '#f59e0b',
  confirmed: colors.primary,
  processing: colors.primary,
  shipped: colors.primary,
  delivered: '#16a34a',
  cancelled: colors.danger,
};

function OrderCard({ order }: { order: Order }) {
  const first = order.items[0];
  return (
    <Link href={{ pathname: '/commande/[numero]', params: { numero: order.orderNumber } }} asChild>
      <Pressable style={styles.card}>
        <ProductImage uri={first?.image} style={styles.image} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={styles.name}>
            {first?.name ?? order.orderNumber}
            {order.items.length > 1 ? ` + ${order.items.length - 1}` : ''}
          </Text>
          <Text style={styles.meta}>
            {order.orderNumber} · {formatDate(order.createdAt)}
          </Text>
          <View style={styles.footer}>
            <Text style={styles.price}>{formatPrice(order.total)}</Text>
            <View style={[styles.pill, { backgroundColor: `${STATUS_TONE[order.status]}1a` }]}>
              <Text style={[styles.pillText, { color: STATUS_TONE[order.status] }]}>{ORDER_STATUS_LABELS[order.status]}</Text>
            </View>
          </View>
          {order.paymentStatus && order.status !== 'cancelled' ? (
            <Text style={styles.meta}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

export default function Orders() {
  const signedIn = useAuth((s) => s.status === 'signed-in');
  const orders = useMyOrders();

  if (!signedIn) {
    return (
      <Message
        title="Vos commandes"
        text="Connectez-vous pour suivre vos commandes et leur paiement."
        action={<Button title="Se connecter" onPress={() => router.push('/auth/connexion')} />}
      />
    );
  }

  return (
    <FlatList
      data={orders.data ?? []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 20, gap: 14, flexGrow: 1 }}
      refreshing={orders.isRefetching}
      onRefresh={() => orders.refetch()}
      ListHeaderComponent={<ErrorText>{orders.error ? errorMessage(orders.error) : null}</ErrorText>}
      renderItem={({ item }) => <OrderCard order={item} />}
      ListEmptyComponent={
        orders.isLoading ? (
          <Body muted>Chargement…</Body>
        ) : (
          <Message
            title="Aucune commande"
            text="Vos commandes apparaîtront ici."
            action={<Button title="Découvrir le catalogue" onPress={() => router.push('/catalogue')} />}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, padding: 12, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  image: { width: 76, height: 76, borderRadius: radius.sm, backgroundColor: colors.surface },
  name: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  price: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 11 },
});

import { Link, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatPrice, formatQuantity, lineUnitPrice, summarizeCart } from '@tsena/shared';
import { ProductImage } from '../components/ProductImage';
import { QuantityStepper } from '../components/QuantityStepper';
import { Body, Button, Card, Message, Row } from '../components/ui';
import { useTieredPricing } from '../features/auth/store';
import { useCart } from '../features/cart/store';
import { colors, fonts } from '../theme';

export default function Cart() {
  const { items, setQuantity, remove } = useCart();
  const tiered = useTieredPricing();

  if (items.length === 0) {
    return (
      <Message
        title="Votre panier est vide"
        text="Ajoutez des produits depuis le catalogue."
        action={<Button title="Voir le catalogue" onPress={() => router.navigate('/catalogue')} />}
      />
    );
  }

  // Aperçu en livraison standard ; le mode choisi à l'étape suivante (et le serveur) fixent le montant final
  const summary = summarizeCart(items, 'standard', tiered);

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.productId}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      renderItem={({ item }) => (
        <Card style={styles.line}>
          <Link href={{ pathname: '/produit/[slug]', params: { slug: item.slug } }} asChild>
            <Pressable>
              <ProductImage uri={item.image} style={styles.image} />
            </Pressable>
          </Link>
          <View style={{ flex: 1, gap: 6 }}>
            <Text numberOfLines={2} style={styles.name}>
              {item.name}
            </Text>
            {item.sellerName ? <Body muted style={{ fontSize: 12 }}>{item.sellerName}</Body> : null}
            <Body muted style={{ fontSize: 13 }}>
              {formatPrice(lineUnitPrice(item, tiered))} / {item.unit} · min. {formatQuantity(item.moq, item.unit)}
            </Body>
            <QuantityStepper value={item.quantity} moq={item.moq} onChange={(q) => setQuantity(item.productId, q)} />
            <View style={styles.lineFooter}>
              <Text style={styles.lineTotal}>{formatPrice(lineUnitPrice(item, tiered) * item.quantity)}</Text>
              <Pressable onPress={() => remove(item.productId)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.remove}>Retirer</Text>
              </Pressable>
            </View>
          </View>
        </Card>
      )}
      ListFooterComponent={
        <Card style={{ gap: 4 }}>
          <Row label="Sous-total" value={formatPrice(summary.subtotal)} />
          <Row label="Livraison standard (estimation)" value={summary.shipping ? formatPrice(summary.shipping) : 'Offerte'} />
          <Row label="Total estimé" value={formatPrice(summary.total)} strong />
          {summary.groups.length > 1 ? (
            <Body muted style={{ fontSize: 13, marginTop: 4 }}>
              {summary.groups.length} vendeurs : une commande par vendeur, un seul paiement.
            </Body>
          ) : null}
          <Button title="Commander" style={{ marginTop: 12 }} onPress={() => router.push('/commande')} />
        </Card>
      }
    />
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 12, padding: 12 },
  image: { width: 80, height: 80, borderRadius: 8 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  lineFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineTotal: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  remove: { color: colors.danger, fontFamily: fonts.body },
});

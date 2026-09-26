import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatPrice, formatQuantity, isUpcoming, type Product } from '@tsena/shared';
import { colors, fonts } from '../theme';
import { ProductImage } from './ProductImage';

export function ProductCard({ product }: { product: Product }) {
  const upcoming = isUpcoming(product.availableFrom);
  return (
    <Link href={{ pathname: '/produit/[slug]', params: { slug: product.slug } }} asChild>
      <Pressable style={styles.card} accessibilityLabel={product.name}>
        <ProductImage uri={product.thumbnails?.[0] ?? product.images[0]} style={styles.image} />
        <View style={styles.body}>
          <Text numberOfLines={2} style={styles.name}>
            {product.name}
          </Text>
          <Text style={styles.price}>{formatPrice(product.price)}</Text>
          <Text style={styles.meta}>Min. {formatQuantity(product.moq, product.unit)}</Text>
          {!product.inStock ? (
            <Text style={[styles.meta, { color: colors.danger }]}>Épuisé</Text>
          ) : upcoming ? (
            <Text style={[styles.meta, { color: colors.primary }]}>Précommande</Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: 6,
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: '100%', aspectRatio: 1 },
  body: { padding: 10, gap: 2 },
  name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, minHeight: 36 },
  price: { fontFamily: fonts.heading, fontSize: 16, color: colors.primary },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatPrice, formatQuantity, isUpcoming, type Product } from '@tsena/shared';
import { useIsFavorite, useWishlist } from '../features/wishlist/store';
import { colors, fonts, radius } from '../theme';
import { ProductImage } from './ProductImage';

// Carte produit du kit Kutuku : image sur fond gris arrondi, cœur en haut à droite, texte centré
export function ProductCard({ product }: { product: Product }) {
  const upcoming = isUpcoming(product.availableFrom);
  const favorite = useIsFavorite(product.id);
  const toggle = useWishlist((s) => s.toggle);
  const subtitle = !product.inStock
    ? 'Épuisé'
    : upcoming
      ? 'Précommande'
      : product.seller?.name ?? `Min. ${formatQuantity(product.moq, product.unit)}`;

  return (
    <Link href={{ pathname: '/produit/[slug]', params: { slug: product.slug } }} asChild>
      <Pressable style={styles.card} accessibilityLabel={product.name}>
        <View style={styles.imageBox}>
          <ProductImage uri={product.thumbnails?.[0] ?? product.images[0]} style={styles.image} />
          <Pressable
            onPress={() => toggle(product)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            style={styles.heart}
          >
            <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={16} color={favorite ? colors.primary : colors.subtle} />
          </Pressable>
        </View>
        <Text numberOfLines={1} style={styles.name}>
          {product.name}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, !product.inStock && { color: colors.danger }]}>
          {subtitle}
        </Text>
        <Text style={styles.price}>{formatPrice(product.price)}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, margin: 8, alignItems: 'center' },
  imageBox: { width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  image: { width: '100%', height: '100%', backgroundColor: colors.surface },
  heart: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.heading, fontSize: 14, color: colors.text, marginTop: 10, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2, textAlign: 'center' },
  price: { fontFamily: fonts.heading, fontSize: 14, color: colors.text, marginTop: 4 },
});

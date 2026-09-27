import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BADGE_LABELS,
  clampToMoq,
  formatDate,
  formatPrice,
  formatQuantity,
  isUpcoming,
  resolveUnitPrice,
} from '@tsena/shared';
import { HeaderActions } from '../../features/cart/HeaderActions';
import { ProductImage } from '../../components/ProductImage';
import { QuantityStepper } from '../../components/QuantityStepper';
import { Body, Button, Loading, Message, Row, errorMessage } from '../../components/ui';
import { useTieredPricing } from '../../features/auth/store';
import { useCart } from '../../features/cart/store';
import { useProduct, useProductReviews } from '../../features/catalog/queries';
import { useIsFavorite, useWishlist } from '../../features/wishlist/store';
import { colors, fonts, radius } from '../../theme';

function RoundButton({ icon, onPress, label }: { icon: 'chevron-back'; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={styles.round} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tiered = useTieredPricing();
  const add = useCart((s) => s.add);
  const toggleFavorite = useWishlist((s) => s.toggle);

  const product = useProduct(slug);
  const reviews = useProductReviews(slug, !!product.data);
  const favorite = useIsFavorite(product.data?.id ?? '');

  // null : minimum de commande du produit, tant que le client n'a pas choisi
  const [chosenQuantity, setQuantity] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);

  const header = (
    <Stack.Screen
      options={{
        headerTransparent: true,
        headerTitle: 'Détail du produit',
        headerTitleAlign: 'center',
        headerLeft: () => <RoundButton icon="chevron-back" label="Retour" onPress={() => router.back()} />,
        headerRight: () => (
          <View style={styles.roundWide}>
            <HeaderActions search={false} />
          </View>
        ),
      }}
    />
  );

  if (product.isLoading) return (<>{header}<Loading /></>);
  const p = product.data;
  if (!p) {
    return (
      <>
        {header}
        <Message
          title="Produit introuvable"
          text={errorMessage(product.error) ?? 'Ce produit n’est plus en vente.'}
          action={<Button title="Retour au catalogue" onPress={() => router.replace('/catalogue')} />}
        />
      </>
    );
  }

  const quantity = chosenQuantity ?? clampToMoq(1, p.moq);
  const unitPrice = tiered ? resolveUnitPrice(p.price, p.priceTiers, quantity) : p.price;
  const upcoming = isUpcoming(p.availableFrom);
  const canBuy = p.inStock || upcoming;
  const stockLimit = typeof p.stockQuantity === 'number' && p.stockQuantity > 0 ? p.stockQuantity : null;
  const images = p.images.length ? p.images : [''];
  const imageHeight = Math.round(width * 0.95);

  const addToCart = () => {
    add(p, quantity);
    Alert.alert('Ajouté au panier', `${formatQuantity(quantity, p.unit)} de ${p.name}`, [
      { text: 'Continuer mes achats', style: 'cancel' },
      { text: 'Voir le panier', onPress: () => router.push('/panier') },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View>
          <FlatList
            data={images}
            keyExtractor={(uri, i) => `${i}-${uri}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <ProductImage uri={item} style={{ width, height: imageHeight, backgroundColor: colors.surface }} />}
          />
          {images.length > 1 ? (
            <View style={styles.imageDots}>
              {images.map((uri, i) => (
                <View key={`${i}-${uri}`} style={[styles.dot, i === imageIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              {p.badges.length > 0 ? <Text style={styles.badges}>{p.badges.map((b) => BADGE_LABELS[b] ?? b).join(' · ')}</Text> : null}
              <Text style={styles.title}>{p.name}</Text>
              {typeof p.rating === 'number' && p.reviewCount ? (
                <View style={styles.rating}>
                  <Ionicons name="star" size={14} color={colors.star} />
                  <Text style={styles.ratingText}>
                    {p.rating.toFixed(1)} <Text style={styles.muted}>({p.reviewCount} avis)</Text>
                  </Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={() => toggleFavorite(p)}
              style={styles.heart}
              accessibilityRole="button"
              accessibilityLabel={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={22} color={favorite ? colors.primary : colors.subtle} />
            </Pressable>
          </View>

          <Text style={styles.price}>
            {formatPrice(unitPrice)} <Text style={styles.unit}>/ {p.unit}</Text>
          </Text>
          {p.originalPrice && p.originalPrice > p.price ? (
            <Text style={[styles.muted, { textDecorationLine: 'line-through' }]}>{formatPrice(p.originalPrice)}</Text>
          ) : null}

          {p.description ? (
            <Text style={styles.description} numberOfLines={expanded ? undefined : 3}>
              {p.description}
            </Text>
          ) : null}
          {p.description && p.description.length > 140 ? (
            <Text style={styles.readMore} onPress={() => setExpanded((v) => !v)}>
              {expanded ? 'Réduire' : 'Lire la suite'}
            </Text>
          ) : null}

          {p.seller ? (
            <View style={styles.seller}>
              <View style={styles.sellerAvatar}>
                <Ionicons name="storefront" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sellerName}>
                  {p.seller.name} <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                </Text>
                <Text style={styles.muted}>Vendeur vérifié</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.infoBox}>
            <Row label="Quantité minimum" value={formatQuantity(p.moq, p.unit)} />
            {upcoming && p.availableFrom ? <Row label="Disponible le" value={formatDate(p.availableFrom)} /> : null}
            {p.freeShipping ? <Row label="Livraison" value="Offerte" /> : null}
            {!p.inStock && !upcoming ? <Body style={{ color: colors.danger }}>Épuisé</Body> : null}
          </View>

          {p.priceTiers.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.subtitle}>Prix dégressifs</Text>
              <View style={styles.infoBox}>
                {p.priceTiers.map((t) => (
                  <Row key={t.minQty} label={`Dès ${formatQuantity(t.minQty, p.unit)}`} value={formatPrice(t.unitPrice)} />
                ))}
              </View>
              {!tiered ? (
                <Text style={[styles.muted, { fontSize: 12 }]}>
                  Réservés aux comptes professionnels approuvés. Les particuliers paient le prix de base.
                </Text>
              ) : null}
            </View>
          ) : null}

          {p.characteristics && p.characteristics.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={styles.subtitle}>Caractéristiques</Text>
              {p.characteristics.map((c) => (
                <Body key={c}>• {c}</Body>
              ))}
            </View>
          ) : null}

          {reviews.data && reviews.data.count > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.subtitle}>Avis ({reviews.data.count})</Text>
              {reviews.data.reviews.slice(0, 5).map((r) => (
                <View key={r.id} style={styles.infoBox}>
                  <Text style={styles.sellerName}>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)} · {r.author}
                  </Text>
                  {r.comment ? <Body style={{ marginTop: 4 }}>{r.comment}</Body> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.totalRow}>
          <View>
            <Text style={styles.muted}>Total</Text>
            <Text style={styles.total}>{formatPrice(unitPrice * quantity)}</Text>
          </View>
          <QuantityStepper value={quantity} moq={p.moq} onChange={setQuantity} />
        </View>
        {stockLimit && quantity > stockLimit && !upcoming ? (
          <Text style={[styles.muted, { color: colors.danger }]}>Stock disponible : {formatQuantity(stockLimit, p.unit)}</Text>
        ) : null}
        <Button
          icon="bag-handle-outline"
          title={canBuy ? (upcoming ? 'Précommander' : 'Ajouter au panier') : 'Épuisé'}
          disabled={!canBuy}
          onPress={addToCart}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  roundWide: { height: 40, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'center' },
  imageDots: { position: 'absolute', bottom: 44, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(15,23,42,0.2)' },
  dotActive: { width: 18, backgroundColor: colors.primary },
  sheet: {
    marginTop: -32,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 24,
    gap: 16,
    minHeight: 400,
  },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  badges: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.text, lineHeight: 29 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  ratingText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  heart: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  price: { fontFamily: fonts.heading, fontSize: 22, color: colors.primary, marginTop: -4 },
  unit: { fontSize: 14, color: colors.muted, fontFamily: fonts.body },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  description: { fontFamily: fonts.body, fontSize: 14, color: colors.subtle, lineHeight: 22 },
  readMore: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.primary, marginTop: -8 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sellerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  sellerName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  infoBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 2 },
  subtitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
});

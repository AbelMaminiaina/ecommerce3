import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  BADGE_LABELS,
  catalogApi,
  clampToMoq,
  formatDate,
  formatPrice,
  formatQuantity,
  isUpcoming,
  resolveUnitPrice,
} from '@tsena/shared';
import { ProductImage } from '../../components/ProductImage';
import { QuantityStepper } from '../../components/QuantityStepper';
import { Body, Button, Card, Loading, Message, Row, Title, errorMessage, styles as ui } from '../../components/ui';
import { useTieredPricing } from '../../features/auth/store';
import { useCart } from '../../features/cart/store';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const tiered = useTieredPricing();
  const add = useCart((s) => s.add);

  const product = useQuery({ queryKey: ['product', slug], queryFn: () => catalogApi.product(api, slug) });
  const reviews = useQuery({ queryKey: ['reviews', slug], queryFn: () => catalogApi.reviews(api, slug), enabled: !!product.data });

  // null : minimum de commande du produit, tant que le client n'a pas choisi
  const [chosenQuantity, setQuantity] = useState<number | null>(null);

  if (product.isLoading) return <Loading />;
  const p = product.data;
  if (!p) {
    return (
      <Message
        title="Produit introuvable"
        text={errorMessage(product.error) ?? 'Ce produit n’est plus en vente.'}
        action={<Button title="Retour au catalogue" onPress={() => router.replace('/catalogue')} />}
      />
    );
  }

  const quantity = chosenQuantity ?? clampToMoq(1, p.moq);
  const unitPrice = tiered ? resolveUnitPrice(p.price, p.priceTiers, quantity) : p.price;
  const upcoming = isUpcoming(p.availableFrom);
  const canBuy = p.inStock || upcoming;
  const stockLimit = typeof p.stockQuantity === 'number' && p.stockQuantity > 0 ? p.stockQuantity : null;

  const addToCart = () => {
    add(p, quantity);
    Alert.alert('Ajouté au panier', `${formatQuantity(quantity, p.unit)} de ${p.name}`, [
      { text: 'Continuer mes achats', style: 'cancel' },
      { text: 'Voir le panier', onPress: () => router.navigate('/panier') },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: p.name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <FlatList
          data={p.images.length ? p.images : ['']}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => <ProductImage uri={item} style={{ width, height: width }} />}
        />

        <View style={ui.screen}>
          <View>
            {p.badges.length > 0 ? (
              <Text style={styles.badges}>{p.badges.map((b) => BADGE_LABELS[b] ?? b).join(' · ')}</Text>
            ) : null}
            <Title>{p.name}</Title>
            {p.seller ? <Body muted>Vendu par {p.seller.name}</Body> : null}
            <Text style={styles.price}>
              {formatPrice(unitPrice)} <Text style={styles.unit}>/ {p.unit}</Text>
            </Text>
            {p.originalPrice && p.originalPrice > p.price ? (
              <Body muted style={{ textDecorationLine: 'line-through' }}>{formatPrice(p.originalPrice)}</Body>
            ) : null}
            {typeof p.rating === 'number' && p.reviewCount ? (
              <Body muted>
                ★ {p.rating.toFixed(1)} ({p.reviewCount} avis)
              </Body>
            ) : null}
          </View>

          <Card style={{ gap: 12 }}>
            <Body>
              Quantité minimum : <Text style={ui.strong}>{formatQuantity(p.moq, p.unit)}</Text>
            </Body>
            <QuantityStepper value={quantity} moq={p.moq} onChange={setQuantity} />
            {stockLimit && quantity > stockLimit && !upcoming ? (
              <Body style={{ color: colors.danger }}>Stock disponible : {formatQuantity(stockLimit, p.unit)}</Body>
            ) : null}
            <Row label="Total" value={formatPrice(unitPrice * quantity)} strong />
            {upcoming && p.availableFrom ? (
              <Body style={{ color: colors.primary }}>Précommande : disponible le {formatDate(p.availableFrom)}</Body>
            ) : null}
            {p.freeShipping ? <Body style={{ color: colors.primary }}>Livraison offerte</Body> : null}
            <Button title={canBuy ? 'Ajouter au panier' : 'Épuisé'} disabled={!canBuy} onPress={addToCart} />
          </Card>

          {p.priceTiers.length > 0 ? (
            <Card>
              <Title style={styles.subtitle}>Prix dégressifs</Title>
              {p.priceTiers.map((t) => (
                <Row key={t.minQty} label={`À partir de ${formatQuantity(t.minQty, p.unit)}`} value={formatPrice(t.unitPrice)} />
              ))}
              {!tiered ? (
                <Body muted style={{ marginTop: 8, fontSize: 13 }}>
                  Réservés aux comptes professionnels approuvés. Les particuliers paient le prix de base.
                </Body>
              ) : null}
            </Card>
          ) : null}

          {p.description ? (
            <View>
              <Title style={styles.subtitle}>Description</Title>
              <Body>{p.description}</Body>
            </View>
          ) : null}

          {p.characteristics && p.characteristics.length > 0 ? (
            <View>
              <Title style={styles.subtitle}>Caractéristiques</Title>
              {p.characteristics.map((c) => (
                <Body key={c}>• {c}</Body>
              ))}
            </View>
          ) : null}

          {reviews.data && reviews.data.count > 0 ? (
            <View style={{ gap: 10 }}>
              <Title style={styles.subtitle}>Avis ({reviews.data.count})</Title>
              {reviews.data.reviews.slice(0, 5).map((r) => (
                <Card key={r.id}>
                  <Body style={ui.strong}>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)} · {r.author}
                  </Body>
                  {r.comment ? <Body style={{ marginTop: 4 }}>{r.comment}</Body> : null}
                </Card>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 12, marginBottom: 4, textTransform: 'uppercase' },
  price: { fontFamily: fonts.heading, fontSize: 24, color: colors.primary, marginTop: 8 },
  unit: { fontSize: 14, color: colors.muted, fontFamily: fonts.body },
  subtitle: { fontSize: 17, marginBottom: 6 },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clampToMoq, formatPrice, formatQuantity, isUpcoming, type Product } from '@tsena/shared';
import { ProductImage } from '../components/ProductImage';
import { Body, Button, ErrorText, TextField, errorMessage, styles as ui } from '../components/ui';
import { useAskAdvisor } from '../features/advisor/queries';
import { useCart } from '../features/cart/store';
import { colors, fonts, radius } from '../theme';

const SUGGESTIONS = ['J’équipe un petit atelier de bricolage', 'Je rénove une salle de bain', 'Des fournitures pour ouvrir une boutique'];

// Ligne produit compacte : photo, nom, prix, ajout au panier (à la quantité minimum de commande)
function AdvisorProduct({ product }: { product: Product }) {
  const add = useCart((s) => s.add);
  const upcoming = isUpcoming(product.availableFrom);
  const canBuy = product.inStock || upcoming;

  const addToCart = () => {
    const quantity = clampToMoq(1, product.moq);
    add(product, quantity);
    Alert.alert('Ajouté au panier', `${formatQuantity(quantity, product.unit)} de ${product.name}`, [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Voir le panier', onPress: () => router.push('/panier') },
    ]);
  };

  return (
    <Link href={{ pathname: '/produit/[slug]', params: { slug: product.slug } }} asChild>
      <Pressable style={styles.product} accessibilityLabel={product.name}>
        <ProductImage uri={product.thumbnails?.[0] ?? product.images[0]} style={styles.productImage} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={2} style={styles.productName}>
            {product.name}
          </Text>
          <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
          <Text style={styles.productMeta}>
            {!canBuy ? 'Épuisé' : upcoming ? 'Précommande' : product.moq > 1 ? `Min. ${formatQuantity(product.moq, product.unit)}` : product.seller?.name ?? ''}
          </Text>
        </View>
        {canBuy ? (
          <Pressable onPress={addToCart} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Ajouter ${product.name} au panier`} style={styles.addButton}>
            <Ionicons name={upcoming ? 'calendar-outline' : 'bag-add-outline'} size={20} color="#fff" />
          </Pressable>
        ) : null}
      </Pressable>
    </Link>
  );
}

// Conseiller IA : le client décrit son besoin, le conseiller propose des produits du catalogue.
// `q` (depuis le catalogue) : question posée dès l'ouverture.
export default function Advisor() {
  const params = useLocalSearchParams<{ q?: string }>();
  const ask = useAskAdvisor();
  const [question, setQuestion] = useState(params.q ?? '');
  const [asked, setAsked] = useState<string | null>(null);
  const autoAsked = useRef(false);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || ask.isPending) return;
    setQuestion(trimmed);
    setAsked(trimmed);
    ask.mutate(trimmed);
  };

  useEffect(() => {
    if (params.q && !autoAsked.current) {
      autoAsked.current = true;
      send(params.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, à l'ouverture depuis le catalogue
  }, [params.q]);

  const answer = ask.data;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Conseiller Tsena' }} />
      <ScrollView contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
        <Body muted>Décrivez votre projet ou votre besoin : notre conseiller vous propose les produits adaptés.</Body>

        <TextField
          label="Votre question"
          placeholder="Ex. : équiper un atelier de menuiserie"
          value={question}
          onChangeText={setQuestion}
          maxLength={500}
          multiline
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={() => send(question)}
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />
        <Button title="Conseillez-moi" icon="sparkles" loading={ask.isPending} disabled={question.trim().length < 3} onPress={() => send(question)} />

        <View style={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} onPress={() => send(s)} disabled={ask.isPending} style={styles.chip} accessibilityRole="button">
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* Limite atteinte (10 questions par heure), conseiller indisponible… : message du serveur */}
        <ErrorText>{errorMessage(ask.error)}</ErrorText>

        {ask.isPending ? <Body muted style={{ textAlign: 'center' }}>Le conseiller réfléchit…</Body> : null}

        {answer && !ask.isPending ? (
          <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
            {asked ? <Text style={styles.question}>« {asked} »</Text> : null}
            <View style={styles.bubble}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={styles.bubbleText}>{answer.message}</Text>
            </View>
            {answer.products.map((p) => (
              <AdvisorProduct key={p.id} product={p} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  question: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontStyle: 'italic' },
  bubble: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primarySoft },
  bubbleText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  productImage: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface },
  productName: { fontFamily: fonts.heading, fontSize: 14, color: colors.text },
  productPrice: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.primary },
  productMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  addButton: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});

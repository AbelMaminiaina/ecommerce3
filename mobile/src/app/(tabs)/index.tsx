import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice, FREE_SHIPPING_THRESHOLD, type Product } from '@tsena/shared';
import { Brand } from '../../components/Brand';
import { HeaderActions } from '../../features/cart/HeaderActions';
import { ProductCard } from '../../features/catalog/ProductCard';
import { ProductImage } from '../../components/ProductImage';
import { Body, Button, Message, errorMessage } from '../../components/ui';
import { useAuth } from '../../features/auth/store';
import { useCategories, useLatestProducts } from '../../features/catalog/queries';
import { colors, fonts, radius } from '../../theme';

const PROMOS = [
  { title: `Livraison offerte dès ${formatPrice(FREE_SHIPPING_THRESHOLD)}`, text: 'Sur toutes vos commandes' },
  { title: 'Prix dégressifs pour les pros', text: 'Plus vous commandez, moins vous payez' },
  { title: 'Paiement Mobile Money', text: 'MVola, Orange Money, Airtel Money' },
];

function Greeting() {
  const user = useAuth((s) => s.user);
  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : null;
  return (
    <Pressable style={styles.greeting} onPress={() => router.navigate(user ? '/profil' : '/auth/connexion')}>
      <View style={styles.avatar}>
        {initials ? <Text style={styles.avatarText}>{initials}</Text> : <Ionicons name="person" size={20} color={colors.primary} />}
      </View>
      <View>
        <Text style={styles.hello}>{user ? `Bonjour, ${user.firstName}` : 'Bienvenue'}</Text>
        <Text style={styles.helloSub}>{user ? 'Bon shopping !' : 'Connectez-vous'}</Text>
      </View>
    </Pressable>
  );
}

function PromoCarousel({ image }: { image?: string | null }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 40;
  const [index, setIndex] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth));

  return (
    <View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ marginHorizontal: 20 }}>
        {PROMOS.map((promo) => (
          <Pressable key={promo.title} onPress={() => router.push('/catalogue')} style={[styles.promo, { width: cardWidth }]}>
            <View style={styles.promoCircle} />
            <View style={styles.promoText}>
              <Text style={styles.promoTitle}>{promo.title}</Text>
              <Text style={styles.promoSub}>{promo.text}</Text>
            </View>
            {image ? <ProductImage uri={image} style={styles.promoImage} /> : null}
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {PROMOS.map((p, i) => (
          <View key={p.title} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="button">
        <Text style={styles.seeAll}>Voir tout</Text>
      </Pressable>
    </View>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'home' | 'categories'>('home');
  const categories = useCategories();
  const latest = useLatestProducts(10);
  const products: Product[] = latest.data?.products ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Brand />
        <HeaderActions />
      </View>
      <Greeting />

      <View style={styles.tabs}>
        {(['home', 'categories'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'home' ? 'Accueil' : 'Catégories'}</Text>
            {tab === t ? <View style={styles.tabLine} /> : null}
          </Pressable>
        ))}
      </View>

      {/* Clés distinctes : les deux listes n'ont pas le même nombre de colonnes (React Native interdit de le changer) */}
      {tab === 'categories' ? (
        <FlatList
          key="categories"
          data={categories.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 20, gap: 12 }}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/catalogue', params: { category: item.slug } }} asChild>
              <Pressable style={styles.categoryRow}>
                <Text style={styles.categoryName}>{item.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </Link>
          )}
          ListEmptyComponent={<Body muted>{categories.isLoading ? 'Chargement…' : 'Aucune catégorie.'}</Body>}
        />
      ) : latest.error && !latest.data ? (
        <Message
          title="Catalogue indisponible"
          text={errorMessage(latest.error) ?? undefined}
          action={<Button title="Réessayer" onPress={() => latest.refetch()} />}
        />
      ) : (
        <FlatList
          key="products"
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: 12 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={latest.isRefetching}
              onRefresh={() => {
                latest.refetch();
                categories.refetch();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={{ paddingTop: 16 }}>
              <PromoCarousel image={products[0]?.thumbnails?.[0] ?? products[0]?.images[0]} />
              <SectionHeader title="Nouveautés 🔥" onSeeAll={() => router.push('/catalogue')} />
            </View>
          }
          renderItem={({ item }) => <ProductCard product={item} />}
          ListEmptyComponent={latest.isLoading ? <Body muted style={{ padding: 20 }}>Chargement…</Body> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  greeting: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.heading, color: colors.primaryDark, fontSize: 14 },
  hello: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  helloSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginHorizontal: 20 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.muted },
  tabTextActive: { color: colors.primary },
  tabLine: { position: 'absolute', bottom: -1, height: 3, width: '60%', borderRadius: 2, backgroundColor: colors.primary },
  promo: {
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  promoCircle: { position: 'absolute', left: -40, bottom: -60, width: 150, height: 150, borderRadius: 75, backgroundColor: colors.primarySoft },
  promoText: { flex: 1, paddingLeft: 24, paddingRight: 8 },
  promoTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.text, lineHeight: 23 },
  promoSub: { fontFamily: fonts.body, fontSize: 12, color: colors.subtle, marginTop: 6 },
  promoImage: { width: 120, height: 150 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.primary },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 24, marginBottom: 4 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  seeAll: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.primary },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  categoryName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
});

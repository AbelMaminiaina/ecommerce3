import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { catalogApi } from '@tsena/shared';
import { ProductCard } from '../../components/ProductCard';
import { Body, Button, Message, Title, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme';

export default function Home() {
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => catalogApi.categories(api) });
  const latest = useQuery({ queryKey: ['products', 'home'], queryFn: () => catalogApi.products(api, { limit: 10 }) });

  if (latest.error && !latest.data) {
    return (
      <Message
        title="Catalogue indisponible"
        text={errorMessage(latest.error) ?? undefined}
        action={<Button title="Réessayer" onPress={() => latest.refetch()} />}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingVertical: 16, gap: 20 }}
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
    >
      <View style={styles.hero}>
        <Title style={{ color: '#fff' }}>Achetez en gros, payez par Mobile Money</Title>
        <Body style={{ color: '#fff', marginTop: 6 }}>Prix dégressifs pour les professionnels, livraison à Madagascar.</Body>
        <Pressable onPress={() => router.push('/catalogue')} style={styles.heroButton} accessibilityRole="button">
          <Text style={styles.heroButtonText}>Voir le catalogue</Text>
        </Pressable>
      </View>

      {categories.data && categories.data.length > 0 ? (
        <View>
          <Title style={styles.section}>Catégories</Title>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {categories.data.map((c) => (
              <Link key={c.id} href={{ pathname: '/catalogue', params: { category: c.slug } }} asChild>
                <Pressable style={styles.chip}>
                  <Text style={styles.chipText}>{c.name}</Text>
                </Pressable>
              </Link>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View>
        <Title style={styles.section}>Nouveautés</Title>
        <FlatList
          data={latest.data?.products ?? []}
          keyExtractor={(p) => p.id}
          numColumns={2}
          scrollEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 10 }}
          renderItem={({ item }) => <ProductCard product={item} />}
          ListEmptyComponent={latest.isLoading ? <Body muted style={{ padding: 16 }}>Chargement…</Body> : null}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 16, padding: 20, borderRadius: 16, backgroundColor: colors.primary },
  heroButton: { marginTop: 14, alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  heroButtonText: { color: colors.primaryDark, fontFamily: fonts.bodyBold },
  section: { paddingHorizontal: 16, marginBottom: 10, fontSize: 18 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontFamily: fonts.body, color: colors.text },
});

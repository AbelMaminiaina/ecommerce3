import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { catalogApi } from '@tsena/shared';
import { ProductCard } from '../components/ProductCard';
import { Body, Button, Message, errorMessage, styles as ui } from '../components/ui';
import { api } from '../lib/api';
import { colors, fonts } from '../theme';

const PAGE_SIZE = 20;

/** Valeur mise à jour après une pause de frappe (évite un appel par lettre) */
function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function Catalogue() {
  const params = useLocalSearchParams<{ category?: string }>();
  const category = params.category ?? '';
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => catalogApi.categories(api) });

  const products = useInfiniteQuery({
    queryKey: ['products', 'list', category, term],
    queryFn: ({ pageParam, signal }) =>
      catalogApi.products(api, { page: pageParam, limit: PAGE_SIZE, category: category || undefined, search: term || undefined }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const items = products.data?.pages.flatMap((p) => p.products) ?? [];
  const total = products.data?.pages[0]?.total;
  const setCategory = (slug: string) => router.setParams({ category: slug || undefined });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.filters}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un produit"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Rechercher un produit"
          style={ui.input}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ slug: '', name: 'Tout' }, ...(categories.data ?? [])]}
          keyExtractor={(c) => c.slug || 'all'}
          contentContainerStyle={{ gap: 8, paddingTop: 10 }}
          renderItem={({ item }) => {
            const active = item.slug === category;
            return (
              <Pressable
                onPress={() => setCategory(item.slug)}
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={[styles.chipText, active && { color: '#fff' }]}>{item.name}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {products.error && items.length === 0 ? (
        <Message
          title="Catalogue indisponible"
          text={errorMessage(products.error) ?? undefined}
          action={<Button title="Réessayer" onPress={() => products.refetch()} />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={{ padding: 10 }}
          renderItem={({ item }) => <ProductCard product={item} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (products.hasNextPage && !products.isFetchingNextPage) products.fetchNextPage();
          }}
          refreshing={products.isRefetching && !products.isFetchingNextPage}
          onRefresh={() => products.refetch()}
          ListHeaderComponent={
            total !== undefined ? <Body muted style={{ marginHorizontal: 6, marginBottom: 4 }}>{total} produit(s)</Body> : null
          }
          ListEmptyComponent={
            products.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
            ) : (
              <Body muted style={{ textAlign: 'center', marginTop: 32 }}>Aucun produit ne correspond.</Body>
            )
          }
          ListFooterComponent={products.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: colors.background },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontFamily: fonts.body, color: colors.text },
});

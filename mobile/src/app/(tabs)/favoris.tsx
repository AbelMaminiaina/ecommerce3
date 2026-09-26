import { router } from 'expo-router';
import { FlatList } from 'react-native';
import { ProductCard } from '../../components/ProductCard';
import { Button, Message } from '../../components/ui';
import { useWishlist } from '../../features/wishlist/store';

export default function Favorites() {
  const products = useWishlist((s) => s.products);

  if (products.length === 0) {
    return (
      <Message
        title="Aucun favori"
        text="Touchez le cœur d’un produit pour le retrouver ici."
        action={<Button title="Découvrir le catalogue" onPress={() => router.push('/catalogue')} />}
      />
    );
  }

  return (
    <FlatList
      data={products}
      keyExtractor={(p) => p.id}
      numColumns={2}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => <ProductCard product={item} />}
    />
  );
}

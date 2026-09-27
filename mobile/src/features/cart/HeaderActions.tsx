import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCartCount } from './store';
import { colors, fonts } from '../../theme';

// Icônes en haut à droite (kit Kutuku) : recherche et panier avec pastille du nombre d'articles
export function HeaderActions({ search = true }: { search?: boolean }) {
  const count = useCartCount();
  return (
    <View style={styles.row}>
      {search ? (
        <Pressable onPress={() => router.push('/catalogue')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Rechercher">
          <Ionicons name="search-outline" size={24} color={colors.text} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => router.push('/panier')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={count ? `Panier, ${count} article(s)` : 'Panier'}
      >
        <Ionicons name="bag-handle-outline" size={24} color={colors.text} />
        {count ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 9, fontFamily: fonts.bodyBold },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useCartCount } from '../../features/cart/store';
import { colors, fonts } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

export default function TabLayout() {
  const cartCount = useCartCount();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontFamily: fonts.body },
        headerTitleStyle: { fontFamily: fonts.heading, color: colors.text },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', headerTitle: 'Tsena Pro', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="catalogue" options={{ title: 'Catalogue', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen
        name="panier"
        options={{ title: 'Panier', tabBarIcon: icon('cart-outline'), tabBarBadge: cartCount || undefined }}
      />
      <Tabs.Screen name="compte" options={{ title: 'Compte', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}

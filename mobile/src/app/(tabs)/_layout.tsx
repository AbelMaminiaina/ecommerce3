import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { HeaderActions } from '../../features/cart/HeaderActions';
import { colors, fonts } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Onglets du kit Kutuku : icône pleine et couleur principale pour l'onglet actif, contour sinon
function icon(active: IconName, inactive: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : inactive} color={color as string} size={24} />;
  };
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
        tabBarStyle: { borderTopColor: colors.border },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleAlign: 'center',
        headerTitleStyle: { fontFamily: fonts.heading, color: colors.text, fontSize: 17 },
        headerRight: () => <HeaderActions search={false} />,
        headerRightContainerStyle: { paddingRight: 20 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', headerShown: false, tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="commandes" options={{ title: 'Mes commandes', tabBarIcon: icon('receipt', 'receipt-outline') }} />
      <Tabs.Screen name="favoris" options={{ title: 'Favoris', tabBarIcon: icon('heart', 'heart-outline') }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: icon('person', 'person-outline') }} />
    </Tabs>
  );
}

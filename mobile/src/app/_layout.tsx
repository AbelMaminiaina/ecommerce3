import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { OfflineBanner } from '../components/OfflineBanner';
import { useAuth } from '../features/auth/store';
import { OFFLINE_QUERY_ROOTS } from '../features/queryKeys';
import { colors, fonts } from '../theme';

SplashScreen.preventAutoHideAsync();

const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    // Données gardées une semaine sur l'appareil : catalogue et fiches consultables hors connexion
    queries: { staleTime: 60_000, gcTime: 7 * DAY, retry: 2 },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'tsena.query-cache' });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold });
  const authStatus = useAuth((s) => s.status);

  useEffect(() => {
    useAuth.getState().restore();
  }, []);

  const ready = fontsLoaded && authStatus !== 'loading';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DAY,
        // Seules les données publiques sont gardées (pas les commandes ni les paiements)
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === 'success' && (OFFLINE_QUERY_ROOTS as readonly string[]).includes(String(q.queryKey[0])),
        },
      }}
    >
      <StatusBar style="dark" />
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: fonts.heading, color: colors.text, fontSize: 17 },
          headerBackTitle: 'Retour',
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="catalogue" options={{ title: 'Catalogue' }} />
        <Stack.Screen name="panier" options={{ title: 'Mon panier' }} />
        <Stack.Screen name="auth/connexion" options={{ title: 'Connexion', presentation: 'modal' }} />
        <Stack.Screen name="auth/inscription" options={{ title: 'Créer un compte', presentation: 'modal' }} />
      </Stack>
    </PersistQueryClientProvider>
  );
}

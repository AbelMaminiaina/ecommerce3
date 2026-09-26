import AsyncStorage from '@react-native-async-storage/async-storage';
import { Quicksand_700Bold } from '@expo-google-fonts/quicksand';
import { Roboto_400Regular, Roboto_700Bold } from '@expo-google-fonts/roboto';
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
  const [fontsLoaded] = useFonts({ Quicksand_700Bold, Roboto_400Regular, Roboto_700Bold });
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
            q.state.status === 'success' && ['products', 'product', 'categories'].includes(String(q.queryKey[0])),
        },
      }}
    >
      <StatusBar style="dark" />
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: fonts.heading, color: colors.text },
          headerBackTitle: 'Retour',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/connexion" options={{ title: 'Connexion', presentation: 'modal' }} />
        <Stack.Screen name="auth/inscription" options={{ title: 'Créer un compte', presentation: 'modal' }} />
      </Stack>
    </PersistQueryClientProvider>
  );
}

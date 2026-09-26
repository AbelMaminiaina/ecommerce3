import type { ExpoConfig } from 'expo/config';

// Adresse de l'API : EXPO_PUBLIC_API_URL (HTTPS recommandé, voir ARCHITECTURE-MOBILE.md §5).
// Android bloque le HTTP non chiffré : il n'est autorisé que si l'API est en http:// (démo sur IP sans domaine).
// Sur ce réseau, mots de passe et jetons circulent en clair : à réserver aux essais.
const cleartextApi = /^http:\/\//i.test(process.env.EXPO_PUBLIC_API_URL ?? '');

const config: ExpoConfig = {
  name: 'Tsena Pro',
  slug: 'tsena-pro',
  scheme: 'tsenapro',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: { supportsTablet: false, bundleIdentifier: 'mg.tsenapro.app' },
  android: {
    package: 'mg.tsenapro.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/favicon.png' },
  experiments: { typedRoutes: true },
  owner: '00781',
  // Projet EAS (compilation dans le cloud Expo), créé par « eas init »
  extra: { eas: { projectId: '49f10614-171c-426c-a2da-1741ae375234' } },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-secure-store',
    'expo-image',
    'expo-web-browser',
    'expo-font',
    'expo-splash-screen',
    ['expo-build-properties', { android: { usesCleartextTraffic: cleartextApi } }],
  ],
};

export default config;

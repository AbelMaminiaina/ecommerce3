import type { ExpoConfig } from 'expo/config';

// Adresse de l'API : EXPO_PUBLIC_API_URL (HTTPS obligatoire sur téléphone, voir ARCHITECTURE-MOBILE.md §5)
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
  plugins: ['expo-router', 'expo-status-bar', 'expo-secure-store', 'expo-image', 'expo-web-browser', 'expo-font', 'expo-splash-screen'],
};

export default config;

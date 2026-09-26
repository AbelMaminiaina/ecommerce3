import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts } from '../theme';

// TanStack Query suit l'état du réseau : requêtes suspendues hors connexion, relancées au retour du réseau
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false))
);

export function OfflineBanner() {
  const [online, setOnline] = useState(onlineManager.isOnline());
  const insets = useSafeAreaInsets();
  useEffect(() => onlineManager.subscribe(setOnline), []);
  if (online) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4 }]} accessibilityLiveRegion="polite">
      <Text style={styles.text}>Hors connexion : le catalogue déjà vu et le panier restent consultables.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#404040', paddingHorizontal: 16, paddingBottom: 6 },
  text: { color: '#fff', fontSize: 13, textAlign: 'center', fontFamily: fonts.body },
});

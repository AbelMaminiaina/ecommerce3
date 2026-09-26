import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

// Logo de l'application : icône panier sur fond vert et nom « Tsena »
export function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg';
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Tsena">
      <View style={[styles.mark, large && styles.markLarge]}>
        <Ionicons name="cart" size={large ? 26 : 18} color="#fff" />
      </View>
      <Text style={[styles.name, large && styles.nameLarge]}>
        Tsena
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  markLarge: { width: 52, height: 52, borderRadius: 16 },
  name: { fontFamily: fonts.heading, fontSize: 20, color: colors.text, letterSpacing: -0.3 },
  nameLarge: { fontSize: 30 },
});

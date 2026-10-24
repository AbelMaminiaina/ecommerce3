import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../../theme';

// Carte « Besoin d'un conseil ? » de l'accueil : ouvre le conseiller IA
export function AdvisorEntry() {
  return (
    <Pressable onPress={() => router.push('/conseiller')} style={styles.card} accessibilityRole="button" accessibilityLabel="Ouvrir le conseiller Tsena">
      <View style={styles.icon}>
        <Ionicons name="sparkles" size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Besoin d’un conseil ?</Text>
        <Text style={styles.text}>Décrivez votre projet, notre conseiller vous propose les produits adaptés.</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  text: { fontFamily: fonts.body, fontSize: 12, color: colors.subtle, marginTop: 2 },
});

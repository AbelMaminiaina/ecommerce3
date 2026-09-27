import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Message } from '../../components/ui';
import { useAuth } from '../../features/auth/store';
import { colors, fonts, radius } from '../../theme';

const COMPANY_STATUS: Record<string, string> = {
  pending: 'Entreprise en cours de validation',
  approved: 'Entreprise approuvée : prix dégressifs actifs',
  rejected: 'Entreprise refusée',
  suspended: 'Entreprise suspendue',
};

function MenuItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable onPress={onPress} style={styles.item} accessibilityRole="button">
      <View style={[styles.itemIcon, danger && { backgroundColor: '#fee2e2' }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.primary} />
      </View>
      <Text style={[styles.itemLabel, { color: tint }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

// Version de l'application installée (app.config.ts), pour savoir quelle compilation tourne sur le téléphone
const APP_VERSION = `Tsena · version ${Constants.expoConfig?.version ?? '?'}`;

export default function Profile() {
  const { status, user, company, logout } = useAuth();

  if (status !== 'signed-in') {
    return (
      <Message
        title="Mon profil"
        text="Connectez-vous pour suivre vos commandes et payer plus vite."
        action={
          <View style={{ gap: 10 }}>
            <Button title="Se connecter" onPress={() => router.push('/auth/connexion')} />
            <Button variant="outline" title="Créer un compte" onPress={() => router.push('/auth/inscription')} />
            <Text style={styles.version}>{APP_VERSION}</Text>
          </View>
        }
      />
    );
  }

  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '?';
  const go = (href: Href) => () => router.push(href);
  const confirmLogout = () =>
    Alert.alert('Se déconnecter ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user ? `${user.firstName} ${user.lastName}` : 'Mon compte'}</Text>
        {user ? <Text style={styles.email}>{user.email}</Text> : null}
        {company ? (
          <View style={styles.companyPill}>
            <Text style={styles.companyText}>
              {company.name} · {COMPANY_STATUS[company.status] ?? company.status}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.menu}>
        <MenuItem icon="receipt-outline" label="Mes commandes" onPress={go('/commandes')} />
        <MenuItem icon="heart-outline" label="Mes favoris" onPress={go('/favoris')} />
        <MenuItem icon="bag-handle-outline" label="Mon panier" onPress={go('/panier')} />
        <MenuItem icon="grid-outline" label="Catalogue" onPress={go('/catalogue')} />
      </View>

      <View style={styles.menu}>
        <MenuItem icon="log-out-outline" label="Se déconnecter" onPress={confirmLogout} />
        <MenuItem icon="trash-outline" label="Supprimer mon compte" onPress={go('/compte/supprimer')} danger />
      </View>
      <Text style={styles.version}>{APP_VERSION}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontFamily: fonts.heading, fontSize: 28, color: colors.primaryDark },
  name: { fontFamily: fonts.heading, fontSize: 20, color: colors.text },
  email: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  companyPill: { marginTop: 8, backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  companyText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primaryDark },
  menu: { backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  itemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15 },
  version: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8 },
});

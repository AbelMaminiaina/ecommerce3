import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loginSchema } from '@tsena/shared';
import { Body, Button, ErrorText, TextField, errorMessage, styles as ui } from '../../components/ui';
import { Brand } from '../../components/Brand';
import { PhoneLoginForm } from '../../features/auth/PhoneLoginForm';
import { useAuth } from '../../features/auth/store';
import { usePhoneLoginStatus } from '../../features/auth/queries';
import { colors, fonts, radius } from '../../theme';

type Method = 'phone' | 'email';

export default function Login() {
  const login = useAuth((s) => s.login);
  // Connexion par SMS proposée en premier quand le serveur sait envoyer des SMS
  const phoneStatus = usePhoneLoginStatus();
  const phoneEnabled = !!phoneStatus.data?.enabled;
  const [chosen, setChosen] = useState<Method | null>(null);
  const method: Method = chosen ?? (phoneEnabled ? 'phone' : 'email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      return setErrors({ email: f.email?.[0], password: f.password?.[0] });
    }
    setErrors({});
    setLoading(true);
    try {
      await login(parsed.data);
      router.back();
    } catch (error) {
      setErrors({ form: errorMessage(error) ?? 'Connexion impossible' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginVertical: 12 }}>
          <Brand size="lg" />
        </View>

        {phoneEnabled ? (
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['phone', 'email'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setChosen(m)}
                accessibilityRole="tab"
                accessibilityState={{ selected: method === m }}
                style={[styles.tab, method === m && styles.tabActive]}
              >
                <Text style={[styles.tabText, method === m && { color: colors.primary }]}>{m === 'phone' ? 'Téléphone' : 'E-mail'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {method === 'phone' ? (
          <PhoneLoginForm onSignedIn={() => router.back()} />
        ) : (
          <>
            <TextField
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
            />
            <TextField
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
            />
            <ErrorText>{errors.form}</ErrorText>
            <Button title="Se connecter" loading={loading} onPress={submit} />
          </>
        )}

        <Body muted style={{ textAlign: 'center' }}>
          Pas encore de compte ?{' '}
          {method === 'phone' ? (
            'Le code SMS crée votre compte.'
          ) : (
            <Text style={{ color: colors.primary }} onPress={() => router.replace('/auth/inscription')}>
              Créer un compte
            </Text>
          )}
        </Body>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: colors.surface, marginBottom: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.card },
  tabText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
});

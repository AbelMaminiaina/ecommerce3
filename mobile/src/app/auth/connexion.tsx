import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { loginSchema } from '@tsena/shared';
import { Body, Button, ErrorText, TextField, errorMessage, styles as ui } from '../../components/ui';
import { useAuth } from '../../features/auth/store';
import { colors } from '../../theme';

export default function Login() {
  const login = useAuth((s) => s.login);
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
        <Body muted style={{ textAlign: 'center' }}>
          Pas encore de compte ?{' '}
          <Text style={{ color: colors.primary }} onPress={() => router.replace('/auth/inscription')}>
            Créer un compte
          </Text>
        </Body>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { registerCustomerSchema, type RegisterCustomerInput } from '@tsena/shared';
import { Body, Button, ErrorText, TextField, errorMessage, styles as ui } from '../../components/ui';
import { useAuth } from '../../features/auth/store';

type Field = keyof RegisterCustomerInput;

// Compte particulier (actif tout de suite). Les comptes entreprise se créent sur le site (validation manuelle).
export default function Register() {
  const register = useAuth((s) => s.register);
  const [form, setForm] = useState<Record<Field, string>>({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  const [loading, setLoading] = useState(false);
  const set = (field: Field) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async () => {
    const parsed = registerCustomerSchema.safeParse({ ...form, phone: form.phone.trim() || undefined });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      return setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v?.[0]])));
    }
    setErrors({});
    setLoading(true);
    try {
      await register(parsed.data);
      router.back();
    } catch (error) {
      setErrors({ form: errorMessage(error) ?? 'Inscription impossible' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
        <TextField label="Prénom" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName} autoComplete="given-name" />
        <TextField label="Nom" value={form.lastName} onChangeText={set('lastName')} error={errors.lastName} autoComplete="family-name" />
        <TextField
          label="E-mail"
          value={form.email}
          onChangeText={set('email')}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextField label="Téléphone (facultatif)" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" />
        <TextField
          label="Mot de passe"
          value={form.password}
          onChangeText={set('password')}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <ErrorText>{errors.form}</ErrorText>
        <Button title="Créer mon compte" loading={loading} onPress={submit} />
        <Body muted style={{ fontSize: 13, textAlign: 'center' }}>
          Vous êtes une entreprise ? Créez votre compte professionnel sur le site pour obtenir les prix dégressifs.
        </Body>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

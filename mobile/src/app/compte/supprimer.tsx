import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Body, Button, ErrorText, TextField, errorMessage, styles as ui } from '../../components/ui';
import { useAuth } from '../../features/auth/store';

// Suppression du compte depuis l'application : exigée par Apple et Google
export default function DeleteAccount() {
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await deleteAccount(password);
      router.dismissTo('/compte');
    } catch (e) {
      setError(errorMessage(e) ?? 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Supprimer mon compte' }} />
      <Body>
        Votre compte et vos données personnelles seront supprimés définitivement. Vos commandes passées sont conservées de
        façon anonyme pour la comptabilité. Si vous êtes vendeur, vos produits sont retirés de la vente.
      </Body>
      <TextField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <ErrorText>{error}</ErrorText>
      <Button variant="danger" title="Supprimer définitivement" disabled={!password} loading={loading} onPress={submit} />
    </ScrollView>
  );
}

import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Body, Button, ErrorText, TextField, errorMessage, styles as ui } from '../../components/ui';
import { formatMalagasyPhone } from '../../features/auth/PhoneLoginForm';
import { useAuth } from '../../features/auth/store';
import { useRequestPhoneCode } from '../../features/auth/queries';
import { colors } from '../../theme';

// Suppression du compte depuis l'application : exigée par Apple et Google.
// Compte créé par SMS (sans mot de passe) : la suppression se confirme avec un code reçu par SMS.
export default function DeleteAccount() {
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const verifiedPhone = useAuth((s) => s.user?.verifiedPhone ?? null);
  const hasEmail = useAuth((s) => !!s.user?.email);
  // Compte sans e-mail (créé par SMS) : il n'a pas de mot de passe, le code est proposé d'emblée
  const [withCode, setWithCode] = useState(!!verifiedPhone && !hasEmail);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestCode = useRequestPhoneCode();

  const sendCode = async () => {
    if (!verifiedPhone) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestCode.mutateAsync(verifiedPhone);
      setDemoCode(result.demoCode ?? null);
      setCodeSent(true);
    } catch (e) {
      setError(errorMessage(e) ?? 'Envoi du code impossible');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await deleteAccount(withCode ? { code } : { password });
      router.dismissTo('/profil');
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

      {withCode ? (
        codeSent ? (
          <>
            <TextField
              label={`Code reçu au ${formatMalagasyPhone(verifiedPhone ?? '')}`}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
            />
            {demoCode ? <Body style={{ fontSize: 13, color: '#b45309' }}>Démonstration : votre code est {demoCode}.</Body> : null}
          </>
        ) : (
          <Button variant="outline" title="Recevoir un code par SMS" loading={loading} onPress={sendCode} />
        )
      ) : (
        <TextField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      )}

      {verifiedPhone ? (
        <Text style={{ color: colors.primary }} onPress={() => setWithCode(!withCode)}>
          {withCode ? 'Utiliser mon mot de passe' : 'Confirmer par un code SMS'}
        </Text>
      ) : null}

      <ErrorText>{error}</ErrorText>
      <Button
        variant="danger"
        title="Supprimer définitivement"
        disabled={withCode ? code.length !== 6 : !password}
        loading={loading && (withCode ? codeSent : true)}
        onPress={submit}
      />
    </ScrollView>
  );
}

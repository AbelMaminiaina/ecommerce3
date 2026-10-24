import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { authApi } from '@tsena/shared';
import { Body, Button, ErrorText, TextField, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { colors } from '../../theme';
import { useAuth } from './store';

type Step = 'phone' | 'code' | 'profile';

// « 0341234567 » -> « 034 12 345 67 » (affichage seulement)
export function formatMalagasyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^261/, '0');
  return /^0\d{9}$/.test(digits) ? `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}` : phone;
}

// Connexion sans mot de passe : numéro -> code à 6 chiffres reçu par SMS -> (nouveau client) prénom et nom.
// Même déroulé que le site (frontend/src/components/shopwise/PhoneLogin.tsx).
export function PhoneLoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const loginWithPhone = useAuth((s) => s.loginWithPhone);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le serveur impose une minute entre deux codes
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e) ?? 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const result = await authApi.requestPhoneCode(api, phone);
      setDemoCode(result.demoCode ?? null);
      setCode('');
      setStep('code');
      setResendIn(60);
    });

  const verify = (withProfile: boolean) =>
    run(async () => {
      const result = await loginWithPhone({
        phone,
        code,
        ...(withProfile ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}),
      });
      if (result === 'needs-profile') setStep('profile');
      else onSignedIn();
    });

  const submit = () => {
    if (step === 'phone') {
      if (phone.replace(/\D/g, '').length < 9) return setError('Saisissez votre numéro de mobile (ex. : 034 12 345 67)');
      sendCode();
    } else if (step === 'code') {
      if (!/^\d{6}$/.test(code)) return setError('Le code reçu par SMS comporte 6 chiffres');
      verify(false);
    } else {
      if (!firstName.trim() || !lastName.trim()) return setError('Merci de saisir votre prénom et votre nom');
      verify(true);
    }
  };

  return (
    <View>
      {step === 'phone' ? (
        <>
          <TextField
            label="Numéro de mobile"
            placeholder="034 12 345 67"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            onSubmitEditing={submit}
          />
          <Body muted style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>
            Telma, Orange ou Airtel : un code vous est envoyé par SMS, sans mot de passe.
          </Body>
        </>
      ) : null}

      {step === 'code' ? (
        <>
          <TextField
            label={`Code reçu au ${formatMalagasyPhone(phone)}`}
            placeholder="••••••"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            onSubmitEditing={submit}
            style={{ fontSize: 22, letterSpacing: 8, textAlign: 'center' }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -4, marginBottom: 12 }}>
            <Text style={{ color: colors.primary }} onPress={() => setStep('phone')}>
              Modifier le numéro
            </Text>
            <Text
              style={{ color: resendIn > 0 || loading ? colors.muted : colors.primary }}
              onPress={resendIn > 0 || loading ? undefined : sendCode}
            >
              {resendIn > 0 ? `Renvoyer (${resendIn} s)` : 'Renvoyer le code'}
            </Text>
          </View>
        </>
      ) : null}

      {step === 'profile' ? (
        <>
          <Body style={{ marginBottom: 12 }}>Bienvenue ! Indiquez votre nom pour créer votre compte.</Body>
          <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoComplete="given-name" autoFocus />
          <TextField label="Nom" value={lastName} onChangeText={setLastName} autoComplete="family-name" onSubmitEditing={submit} />
        </>
      ) : null}

      {demoCode && step !== 'phone' ? (
        <Body style={{ fontSize: 13, color: '#b45309', marginBottom: 8 }}>
          Démonstration : aucun SMS n’est envoyé. Votre code est {demoCode}.
        </Body>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button
        title={step === 'phone' ? 'Recevoir un code par SMS' : step === 'code' ? 'Se connecter' : 'Créer mon compte'}
        loading={loading}
        onPress={submit}
      />
    </View>
  );
}

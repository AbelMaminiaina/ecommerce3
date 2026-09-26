import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { clampToMoq } from '@tsena/shared';
import { colors, fonts } from '../theme';

interface Props {
  value: number;
  moq: number;
  onChange: (quantity: number) => void;
  /** Pas des boutons + et − (le minimum de commande par défaut) */
  step?: number;
}

// Sélecteur de quantité : jamais sous le minimum de commande du produit
export function QuantityStepper({ value, moq, onChange, step = Math.max(1, moq) }: Props) {
  // Saisie libre au clavier (null hors saisie), validée en quittant le champ
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Diminuer la quantité"
        disabled={value <= moq}
        onPress={() => onChange(clampToMoq(value - step, moq))}
        style={[styles.button, value <= moq && { opacity: 0.4 }]}
      >
        <Text style={styles.sign}>−</Text>
      </Pressable>
      <TextInput
        accessibilityLabel="Quantité"
        keyboardType="number-pad"
        value={draft ?? String(value)}
        onChangeText={(text) => setDraft(text.replace(/\D/g, ''))}
        onEndEditing={() => {
          if (draft !== null) onChange(clampToMoq(parseInt(draft, 10), moq));
          setDraft(null);
        }}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Augmenter la quantité"
        onPress={() => onChange(value + step)}
        style={styles.button}
      >
        <Text style={styles.sign}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
  },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sign: { fontSize: 20, color: colors.primary, fontFamily: fonts.bodyBold },
  input: { minWidth: 56, textAlign: 'center', fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, paddingVertical: 8 },
});

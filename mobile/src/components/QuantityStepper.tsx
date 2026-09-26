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
        <Text style={styles.minus}>−</Text>
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
        style={[styles.button, styles.plusButton]}
      >
        <Text style={styles.plus}>+</Text>
      </Pressable>
    </View>
  );
}

// Style du kit Kutuku : « − » cerclé, « + » plein dans la couleur principale
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusButton: { backgroundColor: colors.primary, borderColor: colors.primary },
  minus: { fontSize: 18, lineHeight: 20, color: colors.text, fontFamily: fonts.bodyBold },
  plus: { fontSize: 18, lineHeight: 20, color: '#fff', fontFamily: fonts.bodyBold },
  input: { minWidth: 52, textAlign: 'center', fontSize: 16, fontFamily: fonts.heading, color: colors.text, paddingVertical: 6 },
});

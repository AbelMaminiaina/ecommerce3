import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radius } from '../theme';

export function Title({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.title, style]} />;
}

export function Body({ style, muted, ...props }: TextProps & { muted?: boolean }) {
  return <Text {...props} style={[styles.body, muted && { color: colors.muted }, style]} />;
}

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: 'primary' | 'outline' | 'danger';
  loading?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
}

export function Button({ title, variant = 'primary', loading, disabled, icon, style, ...props }: ButtonProps) {
  const inactive = !!(disabled || loading);
  const filled = variant !== 'outline';
  const tint = variant === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      {...props}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: filled ? tint : 'transparent', borderColor: tint },
        (pressed || inactive) && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={filled ? '#fff' : tint} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={filled ? '#fff' : tint} /> : null}
          <Text style={[styles.buttonText, { color: filled ? '#fff' : tint }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export const TextField = forwardRef<TextInput, FieldProps>(function TextField({ label, error, style, ...props }, ref) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function Message({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={styles.center}>
      <Title style={{ textAlign: 'center' }}>{title}</Title>
      {text ? (
        <Body muted style={{ textAlign: 'center', marginTop: 8 }}>
          {text}
        </Body>
      ) : null}
      {action ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return children ? <Text style={[styles.error, { marginBottom: 12 }]}>{children}</Text> : null;
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Body style={[{ flexShrink: 1 }, strong && styles.strong]}>{label}</Body>
      <Body style={strong && styles.strong}>{value}</Body>
    </View>
  );
}

/** Message d'une erreur d'API ou réseau, pour l'écran */
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message === 'Network request failed'
      ? 'Pas de connexion au serveur. Vérifiez votre réseau.'
      : error.message
    : null;

export const styles = StyleSheet.create({
  title: { fontFamily: fonts.heading, fontSize: 20, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  strong: { fontFamily: fonts.bodyBold },
  label: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: fonts.body,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: 4, fontFamily: fonts.body },
  button: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.border },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  screen: { padding: 16, paddingBottom: 32, gap: 16 },
});

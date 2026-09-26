import { Image, type ImageStyle } from 'expo-image';
import { imageUrl } from '../lib/api';
import { colors } from '../theme';

// Image du backend (« /uploads/… » rendu absolu), gardée en cache disque
export function ProductImage({ uri, style }: { uri?: string | null; style: ImageStyle }) {
  const source = imageUrl(uri);
  return (
    <Image
      source={source ? { uri: source } : null}
      style={[{ backgroundColor: colors.border }, style]}
      contentFit="cover"
      cachePolicy="disk"
      transition={150}
      accessibilityIgnoresInvertColors
    />
  );
}

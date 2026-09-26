import { fetchAPI } from './config';
import { resizeImageFile } from '@/lib/images';

// Envoie une photo de produit (administrateur ou vendeur approuvé) et renvoie son URL (/uploads/…),
// à placer dans `images` du produit. L'image est réduite dans le navigateur avant l'envoi.
export async function uploadImage(file: File, token: string): Promise<string> {
  const body = new FormData();
  body.append('image', await resizeImageFile(file), file.name.replace(/\.\w+$/, '') + '.jpg');
  const { url } = await fetchAPI<{ url: string }>('/uploads', { method: 'POST', body, token });
  return url;
}

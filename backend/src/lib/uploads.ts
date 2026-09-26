import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Stockage des images sur disque (volume Docker `uploads` en production), servies sous /uploads/<fichier>.
// La base ne contient que l'URL. Tout passe par ce module : pour changer de stockage (Cloudinary, S3…),
// seules ces fonctions changent.

export const UPLOADS_URL_PREFIX = '/uploads/';
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

/** Poids maximal d'un fichier reçu (avant traitement) */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // sous la limite nginx (client_max_body_size 10M)
/** Côté maximal de l'image enregistrée (les photos de téléphone sont réduites) */
const MAX_SIDE = 1600;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);
// Nom généré par saveImage : empêche toute sortie du dossier (../) lors d'une suppression
const FILE_NAME = /^[0-9a-f-]{36}\.webp$/;

export class InvalidImageError extends Error {}

// Ré-encode l'image en WebP (orientation corrigée, métadonnées EXIF retirées, côté ≤ 1600 px),
// l'enregistre sous un nom aléatoire et renvoie son URL publique.
export async function saveImage(input: Buffer): Promise<string> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new InvalidImageError('Fichier illisible : envoyez une image PNG, JPEG ou WebP');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new InvalidImageError('Format non supporté : envoyez une image PNG, JPEG ou WebP');
  }

  const output = await sharp(input)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const name = `${randomUUID()}.webp`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), output);
  return `${UPLOADS_URL_PREFIX}${name}`;
}

// Image encodée en data: URI (ancien stockage) -> fichier
export async function saveDataUriImage(dataUri: string): Promise<string> {
  const match = dataUri.match(/^data:image\/[a-z+.-]+;base64,(.+)$/i);
  if (!match) throw new InvalidImageError('Data URI invalide');
  return saveImage(Buffer.from(match[1], 'base64'));
}

const fileNameOf = (url: string): string | null => {
  if (!url.startsWith(UPLOADS_URL_PREFIX)) return null;
  const name = url.slice(UPLOADS_URL_PREFIX.length);
  return FILE_NAME.test(name) ? name : null;
};

// Supprime les fichiers d'images téléversées ; ignore les autres URL (externes, visuels du thème)
// et les fichiers déjà absents. Ne lève jamais d'erreur : un fichier orphelin n'est pas bloquant.
export async function deleteUploadedImages(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      const name = fileNameOf(url);
      if (!name) return;
      try {
        await fs.unlink(path.join(UPLOAD_DIR, name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`Suppression de l'image ${name} impossible :`, error);
        }
      }
    })
  );
}

// Après une mise à jour : supprime les images qui ne sont plus utilisées par le produit
export async function deleteReplacedImages(before: string[], after: string[]): Promise<void> {
  const kept = new Set(after);
  await deleteUploadedImages(before.filter((url) => !kept.has(url)));
}

// URL d'image acceptée dans un produit : fichier téléversé, visuel servi par le site ou URL https
export const IMAGE_URL_PATTERN = /^(\/[\w\-./]+|https:\/\/\S+)$/;

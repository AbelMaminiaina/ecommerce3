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
/** Côté maximal de la miniature (listes et grilles de l'application mobile, économise les données) */
const THUMB_SIDE = 400;
const THUMB_SUFFIX = '-thumb';
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);
// Nom généré par saveImage : empêche toute sortie du dossier (../) lors d'une suppression
const FILE_NAME = /^[0-9a-f-]{36}\.webp$/;

// Miniature d'une image téléversée : même nom suivi de « -thumb » (/uploads/<id>.webp -> /uploads/<id>-thumb.webp).
// Les autres URL (visuels du site, adresses https) n'ont pas de miniature : on les renvoie telles quelles.
export function thumbnailUrl(url: string): string {
  const name = fileNameOf(url);
  return name ? `${UPLOADS_URL_PREFIX}${name.replace(/\.webp$/, `${THUMB_SUFFIX}.webp`)}` : url;
}

const writeThumbnail = (image: Buffer, name: string) =>
  sharp(image)
    .resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(path.join(UPLOAD_DIR, name.replace(/\.webp$/, `${THUMB_SUFFIX}.webp`)));

export class InvalidImageError extends Error {}

// Ré-encode l'image en WebP (orientation corrigée, métadonnées EXIF retirées, côté ≤ 1600 px),
// l'enregistre sous un nom aléatoire avec sa miniature (≤ 400 px) et renvoie l'URL publique de l'image.
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
  await writeThumbnail(output, name);
  return `${UPLOADS_URL_PREFIX}${name}`;
}

// Crée la miniature d'une image téléversée qui n'en a pas (images antérieures aux miniatures).
// Renvoie true si une miniature a été créée.
export async function ensureThumbnail(url: string): Promise<boolean> {
  const name = fileNameOf(url);
  if (!name) return false;
  const thumbPath = path.join(UPLOAD_DIR, name.replace(/\.webp$/, `${THUMB_SUFFIX}.webp`));
  try {
    await fs.access(thumbPath);
    return false;
  } catch {
    try {
      await writeThumbnail(await fs.readFile(path.join(UPLOAD_DIR, name)), name);
      return true;
    } catch {
      return false; // image absente ou illisible : rien à faire
    }
  }
}

// Image encodée en data: URI (ancien stockage) -> fichier
export async function saveDataUriImage(dataUri: string): Promise<string> {
  const match = dataUri.match(/^data:image\/[a-z+.-]+;base64,(.+)$/i);
  if (!match) throw new InvalidImageError('Data URI invalide');
  return saveImage(Buffer.from(match[1], 'base64'));
}

function fileNameOf(url: string): string | null {
  if (!url.startsWith(UPLOADS_URL_PREFIX)) return null;
  const name = url.slice(UPLOADS_URL_PREFIX.length);
  return FILE_NAME.test(name) ? name : null;
}

// Supprime les fichiers d'images téléversées ; ignore les autres URL (externes, visuels du thème)
// et les fichiers déjà absents. Ne lève jamais d'erreur : un fichier orphelin n'est pas bloquant.
export async function deleteUploadedImages(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      const name = fileNameOf(url);
      if (!name) return;
      for (const file of [name, name.replace(/\.webp$/, `${THUMB_SUFFIX}.webp`)]) {
        try {
          await fs.unlink(path.join(UPLOAD_DIR, file));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`Suppression de l'image ${file} impossible :`, error);
          }
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

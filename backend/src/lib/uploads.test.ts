import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

// UPLOAD_DIR est lu au chargement du module : on pointe vers un dossier temporaire avant de l'importer
let dir: string;
let uploads: typeof import('./uploads.js');

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-test-'));
  process.env.UPLOAD_DIR = dir;
  uploads = await import('./uploads.js');
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#0d9488' } }).png().toBuffer();

const fileOf = (url: string) => path.join(dir, url.slice('/uploads/'.length));

describe('saveImage', () => {
  it('ré-encode en WebP sous un nom aléatoire et renvoie son URL', async () => {
    const url = await uploads.saveImage(await png(40, 30));

    expect(url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);
    const meta = await sharp(await fs.readFile(fileOf(url))).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([40, 30]);
  });

  it('réduit les grandes photos à 1600 px de côté', async () => {
    const url = await uploads.saveImage(await png(3200, 1600));
    const meta = await sharp(await fs.readFile(fileOf(url))).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 800]);
  });

  it('refuse un fichier qui n’est pas une image', async () => {
    await expect(uploads.saveImage(Buffer.from('<svg onload="alert(1)"></svg>'))).rejects.toBeInstanceOf(
      uploads.InvalidImageError
    );
    await expect(uploads.saveImage(Buffer.from('pas une image'))).rejects.toBeInstanceOf(uploads.InvalidImageError);
  });

  it('convertit une image data: URI (ancien stockage)', async () => {
    const dataUri = `data:image/png;base64,${(await png(10, 10)).toString('base64')}`;
    const url = await uploads.saveDataUriImage(dataUri);
    await expect(fs.stat(fileOf(url))).resolves.toBeTruthy();
  });
});

describe('suppression des fichiers', () => {
  it('supprime les images retirées et garde les autres', async () => {
    const kept = await uploads.saveImage(await png(10, 10));
    const removed = await uploads.saveImage(await png(10, 10));

    await uploads.deleteReplacedImages([kept, removed, '/electro/img/product-3.png'], [kept]);

    await expect(fs.stat(fileOf(kept))).resolves.toBeTruthy();
    await expect(fs.stat(fileOf(removed))).rejects.toThrow();
  });

  it('ignore les URL externes, les fichiers absents et les chemins suspects', async () => {
    const outside = path.join(dir, '..', 'ne-pas-supprimer.txt');
    await fs.writeFile(outside, 'x');
    try {
      await expect(
        uploads.deleteUploadedImages([
          'https://exemple.com/a.png',
          '/uploads/00000000-0000-0000-0000-000000000000.webp',
          '/uploads/../ne-pas-supprimer.txt',
        ])
      ).resolves.toBeUndefined();
      await expect(fs.stat(outside)).resolves.toBeTruthy();
    } finally {
      await fs.rm(outside, { force: true });
    }
  });
});

describe('IMAGE_URL_PATTERN', () => {
  it.each(['/uploads/abc.webp', '/electro/img/product-3.png', 'https://res.cloudinary.com/x/y.jpg'])('accepte %s', (url) => {
    expect(uploads.IMAGE_URL_PATTERN.test(url)).toBe(true);
  });

  it.each(['data:image/png;base64,AAAA', 'javascript:alert(1)', 'http://exemple.com/a.png', '/a b.png'])(
    'refuse %s',
    (url) => {
      expect(uploads.IMAGE_URL_PATTERN.test(url)).toBe(false);
    }
  );
});

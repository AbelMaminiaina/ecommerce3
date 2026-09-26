import prisma from '../lib/prisma.js';
import { connectRedis } from '../lib/redis.js';
import { invalidateProductCache } from '../lib/cache.js';
import { saveDataUriImage } from '../lib/uploads.js';

// Convertit les images encore stockées en data: URI (ancien stockage) en fichiers sous /uploads,
// pour les produits et les catégories. Sans effet s'il n'y a rien à convertir : il est lancé à chaque
// démarrage du conteneur backend (voir Dockerfile) et peut être relancé à la main (npm run db:migrate-images).

const isDataUri = (value: string | null | undefined): value is string => !!value && value.startsWith('data:');

async function convert(value: string, label: string): Promise<string> {
  try {
    return await saveDataUriImage(value);
  } catch (error) {
    // Image illisible : on la retire plutôt que de bloquer le démarrage
    console.error(`[images] ${label} : image illisible, retirée`, error);
    return '';
  }
}

async function main() {
  let converted = 0;

  const products = await prisma.product.findMany({ select: { id: true, name: true, images: true } });
  for (const product of products) {
    if (!product.images.some(isDataUri)) continue;
    const images: string[] = [];
    for (const image of product.images) {
      const url = isDataUri(image) ? await convert(image, `produit « ${product.name} »`) : image;
      if (url) images.push(url);
      if (isDataUri(image)) converted++;
    }
    await prisma.product.update({ where: { id: product.id }, data: { images } });
  }

  const categories = await prisma.category.findMany({ select: { id: true, name: true, image: true } });
  for (const category of categories) {
    if (!isDataUri(category.image)) continue;
    const url = await convert(category.image, `catégorie « ${category.name} »`);
    await prisma.category.update({ where: { id: category.id }, data: { image: url || null } });
    converted++;
  }

  if (converted > 0) {
    // Les réponses mises en cache contiennent encore les anciennes images
    await connectRedis();
    await invalidateProductCache().catch((error) => console.error('[images] invalidation du cache impossible', error));
  }
  console.log(`[images] ${converted} image(s) convertie(s) en fichiers`);
}

main()
  .catch((error) => {
    console.error('[images] migration interrompue', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Le client Redis garde la connexion ouverte : on termine explicitement
    process.exit();
  });

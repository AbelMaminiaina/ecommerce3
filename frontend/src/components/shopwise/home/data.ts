import { fetchProductsOnServer } from '@/lib/api/products';
import { fetchActiveCategoriesOnServer, type Category } from '@/lib/api/categories';
import { getProductImage } from '@/lib/utils';
import type { Product } from '@/types';

export interface HomeCategory {
  id: string;
  name: string;
  slug: string;
  count: number;
  image: string | null;
}

export interface HomeData {
  heroTiles: Product[];
  carousel: Product[];
  categories: HomeCategory[];
  bestSellers: Product[];
  tabs: { nouveautes: Product[]; populaires: Product[]; tous: Product[] };
  offers: Product[];
}

const hasPhoto = (p: Product) => p.images.length > 0;
const withPhotoFirst = (list: Product[]) => [...list].sort((a, b) => Number(hasPhoto(b)) - Number(hasPhoto(a)));
const orderable = (p: Product) => p.inStock || !!p.availableFrom;

// Répartit le catalogue entre les sections de l'accueil ShopWise, en évitant autant que possible
// d'afficher deux fois le même produit dans les blocs voisins (hero, carrousel, meilleures ventes).
export async function getHomeData(): Promise<HomeData> {
  const [products, categories] = await Promise.all([
    fetchProductsOnServer().catch(() => [] as Product[]),
    fetchActiveCategoriesOnServer().catch(() => [] as Category[]),
  ]);

  const visible = withPhotoFirst(products.filter(orderable));
  const popular = visible.filter((p) => p.badges.includes('populaire'));
  const fresh = visible.filter((p) => p.badges.includes('nouveau'));

  const heroTiles = [...popular, ...fresh, ...visible].filter((p, i, all) => all.indexOf(p) === i).slice(0, 3);
  const used = new Set(heroTiles.map((p) => p.id));
  const carousel = visible.filter((p) => !used.has(p.id)).slice(0, 8);

  const bestSellers = [...popular, ...visible].filter((p, i, all) => all.indexOf(p) === i).slice(0, 4);

  // Offres pro : produits avec tarifs dégressifs d'abord, puis les autres
  const offers = [...visible.filter((p) => p.priceTiers.length > 0), ...visible]
    .filter((p, i, all) => all.indexOf(p) === i && !bestSellers.includes(p))
    .slice(0, 4);

  const homeCategories: HomeCategory[] = categories.map((c) => {
    const inCategory = products.filter((p) => p.category === c.slug);
    const withImage = inCategory.find(hasPhoto);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      count: inCategory.length,
      image: c.image || (withImage ? getProductImage(withImage) : null),
    };
  });

  return {
    heroTiles,
    carousel,
    categories: homeCategories,
    bestSellers,
    tabs: {
      nouveautes: fresh.slice(0, 8),
      populaires: popular.slice(0, 8),
      tous: visible.slice(0, 8),
    },
    offers,
  };
}

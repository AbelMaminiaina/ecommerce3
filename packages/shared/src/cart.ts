// Opérations pures sur le panier : le site (zustand + localStorage) et l'application (zustand + AsyncStorage)
// les enveloppent dans leur propre magasin.

import { clampToMoq } from './pricing';
import type { CartItem, Product } from './types';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Ligne de panier à partir d'une fiche produit ; `image` = miniature de préférence */
export function cartItemFromProduct(product: Product, quantity: number): CartItem {
  return {
    productId: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    quantity: clampToMoq(quantity, product.moq),
    image: product.thumbnails?.[0] ?? product.images[0] ?? '',
    freeShipping: product.freeShipping,
    estimatedWeightKg: product.estimatedWeightKg ?? null,
    availableFrom: product.availableFrom ?? null,
    moq: product.moq,
    unit: product.unit,
    priceTiers: product.priceTiers,
    sellerId: product.seller?.id ?? null,
    sellerName: product.seller?.name ?? null,
  };
}

/** Ajoute (ou cumule) une ligne */
export function addCartItem(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find((i) => i.productId === item.productId);
  if (!existing) return [...items, { ...item, quantity: clampToMoq(item.quantity, item.moq) }];
  return items.map((i) => (i.productId === item.productId ? { ...i, quantity: i.quantity + item.quantity } : i));
}

/** Change la quantité ; 0 ou moins retire la ligne ; jamais sous le minimum de commande */
export function setCartQuantity(items: CartItem[], productId: string, quantity: number): CartItem[] {
  if (quantity <= 0) return items.filter((i) => i.productId !== productId);
  return items.map((i) => (i.productId === productId ? { ...i, quantity: clampToMoq(quantity, i.moq) } : i));
}

export function removeCartItem(items: CartItem[], productId: string): CartItem[] {
  return items.filter((i) => i.productId !== productId);
}

/** Remet d'aplomb un panier relu depuis le stockage (ancien format, données abîmées) : lignes inutilisables écartées */
export function sanitizeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): CartItem[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Partial<CartItem>;
    if (
      typeof item.productId !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.slug !== 'string' ||
      !isNumber(item.price) ||
      !isNumber(item.quantity) ||
      item.quantity <= 0
    ) {
      return [];
    }
    return [
      {
        ...item,
        productId: item.productId,
        name: item.name,
        slug: item.slug,
        price: item.price,
        quantity: item.quantity,
        image: typeof item.image === 'string' ? item.image : '',
        moq: isNumber(item.moq) && item.moq > 0 ? item.moq : 1,
        unit: typeof item.unit === 'string' && item.unit ? item.unit : 'pièce',
        priceTiers: Array.isArray(item.priceTiers)
          ? item.priceTiers.filter((t) => t && isNumber(t.minQty) && isNumber(t.unitPrice))
          : [],
        sellerId: item.sellerId ?? null,
        sellerName: item.sellerName ?? null,
      },
    ];
  });
}

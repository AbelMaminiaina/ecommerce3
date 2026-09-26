'use client';

import { useEffect, useRef, useState } from 'react';
import type { Product } from '@/types';
import { getProductImage, isUpcoming, resolveUnitPrice } from '@/lib/utils';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useCompanyAccess } from '@/hooks/useCompanyAccess';
import { useToast } from './Toast';

// Logique commune des cartes produit (vue grille et vue liste) : prix affiché selon le type de
// compte, ajout au panier, favoris. Les règles B2B (quantité minimum, paliers, accès) sont ici.
export function useProductActions(product: Product) {
  const cart = useCart();
  const wishlist = useWishlist();
  const { addToast } = useToast();
  const { isApproved, canOrder } = useCompanyAccess();
  const [justAdded, setJustAdded] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const wished = wishlist.has(product.id);
  const upcoming = isUpcoming(product.availableFrom);
  const unavailable = !upcoming && !product.inStock;
  // MOQ pour tous (vente en gros). Paliers dégressifs : pros approuvés uniquement.
  const unitPrice = isApproved
    ? resolveUnitPrice(product.price, product.priceTiers, product.moq)
    : product.price;
  const bestTierPrice = product.priceTiers.length
    ? Math.min(product.price, ...product.priceTiers.map((t) => t.unitPrice))
    : null;

  const addToCart = () => {
    cart.addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: getProductImage(product),
      slug: product.slug,
      metadata: product.metadata,
      freeShipping: product.freeShipping,
      estimatedWeightKg: product.estimatedWeightKg,
      availableFrom: product.availableFrom,
      moq: product.moq,
      unit: product.unit,
      priceTiers: product.priceTiers,
      sellerId: product.seller?.id ?? null,
      sellerName: product.seller?.name ?? null,
      quantity: product.moq,
    });

    addToast('success', upcoming ? `${product.name} réservé` : `${product.name} ajouté au panier`);

    setJustAdded(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setJustAdded(false), 2000);
  };

  const toggleWishlist = () => {
    wishlist.toggle(product.id);
    addToast('success', wished ? `${product.name} retiré des favoris` : `${product.name} ajouté aux favoris`);
  };

  const buttonLabel = unavailable
    ? 'Indisponible'
    : justAdded
      ? upcoming ? 'Réservé !' : 'Ajouté !'
      : upcoming ? 'Réserver' : 'Ajouter au panier';

  const buttonAriaLabel = unavailable ? 'Indisponible' : upcoming ? 'Réserver' : 'Ajouter au panier';

  return {
    isApproved,
    canOrder,
    wished,
    upcoming,
    unavailable,
    unitPrice,
    bestTierPrice,
    justAdded,
    addToCart,
    toggleWishlist,
    buttonLabel,
    buttonAriaLabel,
  };
}

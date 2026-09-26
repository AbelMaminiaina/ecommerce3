import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Product } from '@/types';
import { ProductCard } from './ProductCard';
import { useWishlistStore } from '@/hooks/useWishlist';

vi.mock('@/components/shop/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useCompanyAccess', () => ({
  useCompanyAccess: () => ({ isApproved: true, canOrder: true }),
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Carton emballage',
    slug: 'carton-emballage',
    category: 'emballage',
    description: 'desc',
    shortDescription: 'short',
    price: 1200,
    images: ['/img.jpg'],
    inStock: true,
    badges: [],
    moq: 1,
    unit: 'piece',
    priceTiers: [],
    freeShipping: false,
    estimatedWeightKg: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('ProductCard — tarification & livraison', () => {
  it('labels the CTA "Ajouter au panier"', () => {
    render(<ProductCard product={makeProduct()} />);
    expect(screen.getByRole('button', { name: 'Ajouter au panier' })).toBeInTheDocument();
  });

  it('shows the minimum order quantity', () => {
    render(<ProductCard product={makeProduct({ moq: 25, unit: 'carton' })} />);
    expect(screen.getByText(/Quantité minimum.*25 carton/)).toBeInTheDocument();
  });

  it('shows a "from" price hint when price tiers exist and beat the base price', () => {
    render(<ProductCard product={makeProduct({ price: 1200, priceTiers: [{ minQty: 100, unitPrice: 900 }] })} />);
    expect(screen.getByText(/à partir de 900 Ar en gros/)).toBeInTheDocument();
  });

  it('n’affiche pas le poids estimé sur la carte (il est dans la fiche produit)', () => {
    render(<ProductCard product={makeProduct({ estimatedWeightKg: 1.8 })} />);
    expect(screen.queryByText(/Poids estimé/)).not.toBeInTheDocument();
    expect(screen.queryByText(/≈ 1,8 kg/)).not.toBeInTheDocument();
  });

  it('shows a "Livraison offerte" badge when the product has free shipping', () => {
    render(<ProductCard product={makeProduct({ freeShipping: true })} />);
    expect(screen.getByText('Livraison offerte')).toBeInTheDocument();
  });

  it('does not show the free-shipping badge otherwise', () => {
    render(<ProductCard product={makeProduct({ freeShipping: false })} />);
    expect(screen.queryByText('Livraison offerte')).not.toBeInTheDocument();
  });

  it('shows the price unit based on the product unit', () => {
    render(<ProductCard product={makeProduct({ unit: 'carton' })} />);
    expect(screen.getByText(/\/carton/)).toBeInTheDocument();
  });
});

describe('ProductCard — date de disponibilité', () => {
  const future = new Date(Date.now() + 30 * 86400_000).toISOString();
  const past = new Date(Date.now() - 30 * 86400_000).toISOString();

  it('shows "Réserver" and the availability date for an upcoming product, even out of stock — no "Rupture de stock" overlay', () => {
    render(<ProductCard product={makeProduct({ availableFrom: future, inStock: false })} />);
    expect(screen.getByRole('button', { name: 'Réserver' })).toBeInTheDocument();
    expect(screen.getByText(/Disponible le/)).toBeInTheDocument();
    expect(screen.queryByText('Rupture de stock')).not.toBeInTheDocument();
  });

  it('behaves normally when the availability date is in the past', () => {
    render(<ProductCard product={makeProduct({ availableFrom: past })} />);
    expect(screen.getByRole('button', { name: 'Ajouter au panier' })).toBeInTheDocument();
    expect(screen.queryByText(/Disponible le/)).not.toBeInTheDocument();
  });

  it('affiche la note moyenne et le nombre d’avis', () => {
    render(<ProductCard product={makeProduct({ rating: 4.5, reviewCount: 8 })} />);
    expect(screen.getByRole('img', { name: 'Note : 4,5 sur 5 (8 avis)' })).toBeInTheDocument();
  });

  it('affiche « Aucun avis » quand le produit n’a pas de note', () => {
    render(<ProductCard product={makeProduct({ rating: null, reviewCount: 0 })} />);
    expect(screen.getByRole('img', { name: 'Aucun avis' })).toBeInTheDocument();
  });

  it('ajoute puis retire un produit des favoris avec le cœur', () => {
    useWishlistStore.getState().clear();
    render(<ProductCard product={makeProduct()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    expect(useWishlistStore.getState().ids).toEqual(['p1']);
    expect(screen.getByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Retirer des favoris' }));
    expect(useWishlistStore.getState().ids).toEqual([]);
  });
});

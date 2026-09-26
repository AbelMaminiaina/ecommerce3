import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Product } from '@/types';
import ProductsClient from './ProductsClient';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/shop/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useCompanyAccess', () => ({
  useCompanyAccess: () => ({ isApproved: false, canOrder: true }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    loading: false,
    categories: [
      { id: 'c1', name: 'Emballage', slug: 'emballage', order: 1, isActive: true },
      { id: 'c2', name: 'Quincaillerie', slug: 'quincaillerie', order: 2, isActive: true },
    ],
  }),
}));

function makeProduct(i: number, overrides: Partial<Product> = {}): Product {
  return {
    id: `p${i}`,
    name: `Produit ${i}`,
    slug: `produit-${i}`,
    category: 'emballage',
    description: 'desc',
    shortDescription: 'short',
    price: 1000 * i,
    images: ['/img.jpg'],
    inStock: true,
    badges: [],
    moq: 1,
    unit: 'piece',
    priceTiers: [],
    freeShipping: false,
    estimatedWeightKg: null,
    createdAt: `2026-01-${String(i).padStart(2, '0')}`,
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

// 11 produits : 10 emballages (1000..10000 Ar) + 1 quincaillerie chère
const products = [
  ...Array.from({ length: 10 }, (_, i) => makeProduct(i + 1)),
  makeProduct(11, { name: 'Perceuse', category: 'quincaillerie', unit: 'carton', price: 50000 }),
];

// Compteur de résultats de la barre d'outils (l'<output> du curseur de prix porte aussi le rôle « status »)
const count = () => document.querySelector('.shop-toolbar [role="status"]') as HTMLElement;
const names = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('ProductsClient — page Shop', () => {
  it('pagine les résultats par 9 et navigue entre les pages', () => {
    render(<ProductsClient initialProducts={products} />);
    expect(count()).toHaveTextContent('11 produits');
    // La barre latérale « Produits en vedette » cite aussi des produits : on ne regarde que la grille
    const grid = () => within(document.querySelector('.shop-results') as HTMLElement);
    expect(grid().queryByText('Perceuse')).not.toBeInTheDocument(); // sur la page 2

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(grid().getByText('Perceuse')).toBeInTheDocument();
    expect(grid().queryByText('Produit 1')).not.toBeInTheDocument();
  });

  it('filtre par mots-clés', () => {
    render(<ProductsClient initialProducts={products} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher un produit' }), { target: { value: 'perceuse' } });
    expect(count()).toHaveTextContent('1 produit');
    expect(screen.getByText('Perceuse')).toBeInTheDocument();
  });

  it('filtre par « Vendu par » (unité)', () => {
    render(<ProductsClient initialProducts={products} />);
    fireEvent.click(screen.getByLabelText(/carton \(1\)/));
    expect(count()).toHaveTextContent('1 produit');
  });

  it('filtre par prix maximum', () => {
    render(<ProductsClient initialProducts={products} />);
    fireEvent.change(screen.getByLabelText('Prix maximum'), { target: { value: '3000' } });
    expect(count()).toHaveTextContent('3 produits');
  });

  it('trie par prix décroissant', () => {
    render(<ProductsClient initialProducts={products} />);
    fireEvent.change(screen.getByLabelText('Trier par :'), { target: { value: 'price-desc' } });
    const grid = document.querySelector('.shop-results') as HTMLElement;
    const firstTitle = within(grid).getAllByRole('link', { name: /^(Perceuse|Produit \d+)$/ })[0];
    expect(firstTitle).toHaveTextContent('Perceuse');
  });

  it('bascule en vue liste', () => {
    render(<ProductsClient initialProducts={products} />);
    expect(document.querySelector('.shop-list')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Vue liste' }));
    expect(document.querySelectorAll('.shop-list .sw-product').length).toBe(9);
    expect(names().length).toBeGreaterThan(0);
  });

  it('réinitialise les filtres', () => {
    render(<ProductsClient initialProducts={products} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher un produit' }), { target: { value: 'perceuse' } });
    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser les filtres/ }));
    expect(count()).toHaveTextContent('11 produits');
  });
});

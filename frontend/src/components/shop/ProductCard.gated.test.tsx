import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Product } from '@/types';
import { ProductCard } from './ProductCard';

vi.mock('@/components/shop/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

const access = vi.hoisted(() => ({
  current: { isApproved: false, isCustomer: false, canOrder: true },
}));

vi.mock('@/hooks/useCompanyAccess', () => ({
  useCompanyAccess: () => access.current,
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
    moq: 50,
    unit: 'piece',
    priceTiers: [{ minQty: 100, unitPrice: 1000 }],
    freeShipping: false,
    estimatedWeightKg: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  access.current = { isApproved: false, isCustomer: false, canOrder: true };
});

describe('ProductCard — particulier / visiteur', () => {
  it('shows the base price, the MOQ and an add-to-cart button', () => {
    render(<ProductCard product={makeProduct()} />);
    expect(screen.getByText('1 200 Ar')).toBeInTheDocument();
    expect(screen.getByText(/Quantité minimum/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter au panier' })).toBeInTheDocument();
  });

  it('does not reveal wholesale tier prices, only that they exist for pros', () => {
    render(<ProductCard product={makeProduct()} />);
    expect(screen.queryByText(/à partir de 1 000 Ar/)).not.toBeInTheDocument();
    expect(screen.getByText(/tarifs dégressifs pour les pros/)).toBeInTheDocument();
  });
});

describe('ProductCard — professionnel approuvé', () => {
  it('shows the MOQ and the best wholesale price', () => {
    access.current = { isApproved: true, isCustomer: false, canOrder: true };
    render(<ProductCard product={makeProduct()} />);
    expect(screen.getByText(/Quantité minimum/)).toBeInTheDocument();
    expect(screen.getByText(/à partir de 1 000 Ar en gros/)).toBeInTheDocument();
  });
});

describe('ProductCard — entreprise non approuvée', () => {
  it('shows the price but no add-to-cart button', () => {
    access.current = { isApproved: false, isCustomer: false, canOrder: false };
    render(<ProductCard product={makeProduct()} />);
    expect(screen.getByText('1 200 Ar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter au panier' })).not.toBeInTheDocument();
  });
});

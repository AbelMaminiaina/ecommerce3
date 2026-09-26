import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Product } from '@/types';
import ProductDetailClient from './ProductDetailClient';

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
    price: 30000,
    images: ['/img.jpg'],
    inStock: true,
    badges: [],
    moq: 1,
    unit: 'piece',
    priceTiers: [],
    freeShipping: false,
    estimatedWeightKg: null,
    availableFrom: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('ProductDetailClient — bloc « Livraison gratuite »', () => {
  it('affiche « Dès 200 000 Ar d’achat » pour un produit sans livraison offerte', () => {
    render(<ProductDetailClient product={makeProduct({ freeShipping: false })} relatedProducts={[]} />);
    expect(screen.getByText(/Dès 200 000 Ar d’achat/)).toBeInTheDocument();
    expect(screen.queryByText('Incluse pour ce produit')).not.toBeInTheDocument();
  });

  it('remplace la condition par « Incluse pour ce produit » quand le produit est en livraison offerte', () => {
    render(<ProductDetailClient product={makeProduct({ freeShipping: true })} relatedProducts={[]} />);
    expect(screen.getByText('Incluse pour ce produit')).toBeInTheDocument();
    expect(screen.queryByText(/Dès 200 000 Ar d’achat/)).not.toBeInTheDocument();
  });
});

describe('ProductDetailClient — précommande', () => {
  const future = new Date(Date.now() + 30 * 86400_000).toISOString();

  it('montre la date de dispo et le bouton « Réserver » avant la date, sans « Rupture de stock »', () => {
    render(
      <ProductDetailClient
        product={makeProduct({ availableFrom: future, inStock: false })}
        relatedProducts={[]}
      />
    );
    expect(screen.getByRole('button', { name: /Réserver/ })).toBeInTheDocument();
    expect(screen.getByText(/réservation possible dès maintenant/)).toBeInTheDocument();
    expect(screen.queryByText('Rupture de stock')).not.toBeInTheDocument();
    expect(screen.queryByText('Bientôt disponible')).not.toBeInTheDocument();
  });
});

describe('ProductDetailClient — page « Single » du template', () => {
  it('affiche les onglets Description / Avis et bascule entre les deux', () => {
    render(<ProductDetailClient product={makeProduct({ description: 'Texte de description' })} relatedProducts={[]} />);

    expect(screen.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Avis/ })).toHaveAttribute('aria-selected', 'false');
    expect(document.querySelector('.tab-pane.active')).toHaveTextContent('Texte de description');

    fireEvent.click(screen.getByRole('tab', { name: /Avis/ }));
    expect(screen.getByRole('tab', { name: /Avis/ })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('.tab-pane.active')).not.toHaveTextContent('Texte de description');
  });

  it('propose le formulaire « Laisser un avis » et la connexion aux visiteurs', () => {
    render(<ProductDetailClient product={makeProduct()} relatedProducts={[]} />);
    expect(screen.getByText('Laisser un avis')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connectez-vous' })).toBeInTheDocument();
  });

  it('respecte la quantité minimum de gros dans le sélecteur', () => {
    render(<ProductDetailClient product={makeProduct({ moq: 10 })} relatedProducts={[]} />);
    const input = screen.getByLabelText('Quantité') as HTMLInputElement;
    expect(input.value).toBe('10');

    fireEvent.click(screen.getByRole('button', { name: 'Diminuer la quantité' }));
    expect(input.value).toBe('10'); // jamais sous le minimum

    fireEvent.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    expect(input.value).toBe('11');
  });

  it('affiche les produits similaires sous la fiche', () => {
    const related = [makeProduct({ id: 'r1', name: 'Produit voisin', slug: 'produit-voisin' })];
    render(<ProductDetailClient product={makeProduct()} relatedProducts={related} />);
    expect(screen.getByText('Produits similaires')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Produit voisin' })).toHaveAttribute('href', '/produits/produit-voisin');
  });

  it('n’affiche pas la section « Produits similaires » sans produit', () => {
    render(<ProductDetailClient product={makeProduct()} relatedProducts={[]} />);
    expect(screen.queryByText('Produits similaires')).not.toBeInTheDocument();
  });

  it('ajoute au panier la quantité choisie avec le vendeur', () => {
    localStorage.clear();
    render(
      <ProductDetailClient
        product={makeProduct({ moq: 10, seller: { id: 's1', name: 'Vendeur SARL' } })}
        relatedProducts={[]}
      />
    );
    // Nom du vendeur : lien vers sa boutique (colonne d'infos et fiche technique)
    const links = screen.getAllByRole('link', { name: 'Vendeur SARL' });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/vendeurs/s1');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter au panier/ }));
    const stored = JSON.parse(localStorage.getItem('b2b-cart') || '{}');
    expect(stored.state.items[0]).toMatchObject({ quantity: 10, sellerId: 's1', sellerName: 'Vendeur SARL' });
  });
});

describe('ProductDetailClient — poids estimé', () => {
  it('détaille le poids estimé dans la fiche technique', () => {
    render(<ProductDetailClient product={makeProduct({ estimatedWeightKg: 1.8, unit: 'pièce' })} relatedProducts={[]} />);
    const row = screen.getByText('Poids estimé', { selector: 'th' }).closest('tr')!;
    expect(row).toHaveTextContent('≈ 1,8 kg par pièce');
    expect(row).toHaveTextContent('indicatif');
  });

  it('indique « Non renseigné » sans poids', () => {
    render(<ProductDetailClient product={makeProduct({ estimatedWeightKg: null })} relatedProducts={[]} />);
    const row = screen.getByText('Poids estimé', { selector: 'th' }).closest('tr')!;
    expect(row).toHaveTextContent('Non renseigné');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductForm } from './ProductForm';
import { MIN_WHOLESALE_QTY } from '@/lib/utils';

const push = vi.fn();
const createSellerProduct = vi.fn().mockResolvedValue({ success: true });

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { accessToken: 'tok' } }) }));
vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    loading: false,
    categories: [{ id: 'c1', name: 'Mobiles', slug: 'mobiles', order: 1, isActive: true }],
  }),
}));
const uploadImage = vi.fn().mockResolvedValue('/uploads/photo.webp');
vi.mock('@/lib/api/uploads', () => ({ uploadImage: (...args: unknown[]) => uploadImage(...args) }));
vi.mock('@/lib/api/seller', () => ({
  createSellerProduct: (...args: unknown[]) => createSellerProduct(...args),
  updateSellerProduct: vi.fn(),
}));

beforeEach(() => {
  push.mockClear();
  createSellerProduct.mockClear();
  uploadImage.mockClear();
});

function fillValidForm(moq: string) {
  fireEvent.change(screen.getByLabelText(/Nom du produit/), { target: { value: 'Smartphone pro' } });
  fireEvent.change(screen.getByLabelText(/Résumé/), { target: { value: 'Smartphone pour revendeurs' } });
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'Un smartphone destiné aux revendeurs.' } });
  fireEvent.change(screen.getByLabelText(/Catégorie/), { target: { value: 'mobiles' } });
  fireEvent.change(screen.getByLabelText(/Prix unitaire de base/), { target: { value: '1000000' } });
  fireEvent.change(screen.getByLabelText(/Quantité minimum de commande/), { target: { value: moq } });
  fireEvent.change(screen.getByLabelText(/Stock disponible/), { target: { value: '100' } });
}

describe('ProductForm (espace vendeur)', () => {
  it('annonce la règle de vente en gros', () => {
    render(<ProductForm />);
    expect(screen.getAllByText(String(MIN_WHOLESALE_QTY)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Quantité minimum de commande/)).toHaveValue(MIN_WHOLESALE_QTY);
  });

  it('refuse une quantité minimum sous le plancher de gros, sans appeler le serveur', async () => {
    render(<ProductForm />);
    fillValidForm(String(MIN_WHOLESALE_QTY - 1));

    fireEvent.submit(screen.getByRole('button', { name: /Publier/ }).closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Vente en gros uniquement');
    expect(createSellerProduct).not.toHaveBeenCalled();
  });

  it('envoie la photo choisie et garde son URL dans le produit (plus de base64)', async () => {
    render(<ProductForm />);
    fillValidForm(String(MIN_WHOLESALE_QTY));
    const file = new File(['x'], 'photo.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText(/Ajouter/), { target: { files: [file] } });

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(file, 'tok'));
    await screen.findByAltText('Photo 1');
    fireEvent.submit(screen.getByRole('button', { name: /Publier/ }).closest('form')!);
    await waitFor(() => expect(createSellerProduct).toHaveBeenCalledTimes(1));
    expect(createSellerProduct.mock.calls[0][0].images).toEqual(['/uploads/photo.webp']);
  });

  it('envoie le produit puis retourne à la liste quand tout est valide', async () => {
    render(<ProductForm />);
    fillValidForm(String(MIN_WHOLESALE_QTY));

    fireEvent.submit(screen.getByRole('button', { name: /Publier/ }).closest('form')!);

    await waitFor(() => expect(createSellerProduct).toHaveBeenCalledTimes(1));
    const [payload, token] = createSellerProduct.mock.calls[0];
    expect(token).toBe('tok');
    expect(payload).toMatchObject({ name: 'Smartphone pro', category: 'mobiles', moq: MIN_WHOLESALE_QTY, price: 1000000 });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/vendeur?saved=1'));
  });
});

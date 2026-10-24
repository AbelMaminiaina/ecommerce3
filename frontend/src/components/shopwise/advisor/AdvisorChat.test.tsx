import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Product } from '@/types';
import { askAdvisor } from '@/lib/api/advisor';
import { AdvisorChat } from './AdvisorChat';

vi.mock('@/lib/api/advisor', () => ({ askAdvisor: vi.fn() }));

vi.mock('@/components/shop/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useCompanyAccess', () => ({
  useCompanyAccess: () => ({ isApproved: false, canOrder: true }),
}));

const askMock = vi.mocked(askAdvisor);

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Perceuse visseuse',
    slug: 'perceuse-visseuse',
    category: 'outillage',
    description: 'desc',
    shortDescription: 'short',
    price: 185000,
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

beforeEach(() => {
  askMock.mockReset();
});

describe('AdvisorChat', () => {
  it('shows the advisor message and the suggested products', async () => {
    askMock.mockResolvedValue({ message: 'Une perceuse fera l’affaire.', source: 'ai', products: [makeProduct()] });
    render(<AdvisorChat compact />);

    fireEvent.change(screen.getByLabelText('Votre question au conseiller'), { target: { value: 'percer un mur' } });
    fireEvent.click(screen.getByRole('button', { name: /Conseillez-moi/ }));

    expect(await screen.findByText('Une perceuse fera l’affaire.')).toBeInTheDocument();
    expect(screen.getByText('Perceuse visseuse')).toBeInTheDocument();
    expect(askMock).toHaveBeenCalledWith('percer un mur');
  });

  it('asks a suggestion in one click', async () => {
    askMock.mockResolvedValue({ message: 'Voici.', source: 'fallback', products: [] });
    render(<AdvisorChat compact />);

    fireEvent.click(screen.getByRole('button', { name: 'Je rénove une salle de bain' }));

    expect(await screen.findByText('Voici.')).toBeInTheDocument();
    expect(askMock).toHaveBeenCalledWith('Je rénove une salle de bain');
  });

  it('shows the backend error (rate limit…)', async () => {
    askMock.mockRejectedValue(new Error('Trop de demandes, merci de réessayer un peu plus tard.'));
    render(<AdvisorChat compact />);

    fireEvent.click(screen.getByRole('button', { name: 'Je rénove une salle de bain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de demandes');
  });
});

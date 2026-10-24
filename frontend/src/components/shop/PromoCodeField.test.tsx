import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { previewPromo, type PromoPreview } from '@/lib/api/promo';
import { forgetReferral, rememberReferral, storedReferral } from '@/lib/referral';
import { PromoCodeField } from './PromoCodeField';

vi.mock('@/lib/api/promo', () => ({ previewPromo: vi.fn() }));

const previewMock = vi.mocked(previewPromo);

function Harness({ subtotal = 100_000 }: { subtotal?: number }) {
  const [applied, setApplied] = useState<PromoPreview | null>(null);
  return (
    <>
      <PromoCodeField itemsSubtotal={subtotal} token="t" applied={applied} onChange={setApplied} />
      <output data-testid="discount">{applied?.discount ?? 0}</output>
    </>
  );
}

beforeEach(() => {
  previewMock.mockReset();
  forgetReferral();
});

describe('PromoCodeField', () => {
  it('applique un code saisi et affiche la remise', async () => {
    previewMock.mockResolvedValue({ code: 'FETE', discount: 10_000, label: '-10 %', description: null });
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /code promo/ }));
    fireEvent.change(screen.getByLabelText('Code promo'), { target: { value: 'fete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(await screen.findByText('FETE')).toBeInTheDocument();
    expect(previewMock).toHaveBeenCalledWith('FETE', 100_000, 't');
    expect(screen.getByTestId('discount')).toHaveTextContent('10000');

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le code FETE' }));
    expect(screen.getByTestId('discount')).toHaveTextContent('0');
  });

  it('explique pourquoi un code est refusé', async () => {
    previewMock.mockRejectedValue(new Error('Ce code promo a expiré'));
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /code promo/ }));
    fireEvent.change(screen.getByLabelText('Code promo'), { target: { value: 'VIEUX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('expiré');
  });

  it('propose automatiquement le code d’un lien de parrainage', async () => {
    rememberReferral('tsena-abc123');
    previewMock.mockResolvedValue({ code: 'TSENA-ABC123', discount: 10_000, label: 'Parrainage -10 %', description: null });
    render(<Harness />);

    expect(await screen.findByText('TSENA-ABC123')).toBeInTheDocument();
    expect(previewMock).toHaveBeenCalledWith('TSENA-ABC123', 100_000, 't');
  });

  it('attend que le panier soit chargé avant d’essayer le code de parrainage', () => {
    rememberReferral('TSENA-ABC123');
    render(<Harness subtotal={0} />);
    expect(previewMock).not.toHaveBeenCalled();
  });
});

describe('lien de parrainage', () => {
  it('garde un code valide et ignore le reste', () => {
    rememberReferral('<script>');
    expect(storedReferral()).toBeNull();
    rememberReferral(' tsena-xyz789 ');
    expect(storedReferral()).toBe('TSENA-XYZ789');
    forgetReferral();
    expect(storedReferral()).toBeNull();
  });
});

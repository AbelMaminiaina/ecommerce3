import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { confirmReceipt, openDispute } from '@/lib/api/orders';
import { isServedCity } from '@/lib/cashOnDelivery';
import { OrderProtectionBox } from './OrderProtectionBox';

vi.mock('@/lib/api/orders', () => ({ confirmReceipt: vi.fn(), openDispute: vi.fn() }));
vi.mock('./Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

const delivered = {
  protection: 'protected' as const,
  deliveredAt: '2026-10-24T10:00:00Z',
  disputeDeadline: '2026-10-27T10:00:00Z',
  canConfirmReceipt: true,
  canOpenDispute: true,
};

beforeEach(() => {
  vi.mocked(confirmReceipt).mockReset();
  vi.mocked(openDispute).mockReset();
});

describe('OrderProtectionBox', () => {
  it("n'affiche rien pour une commande non payée", () => {
    const { container } = render(<OrderProtectionBox orderId="o1" protection={{ protection: 'none' }} token="t" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('confirme la réception puis recharge les commandes', async () => {
    vi.mocked(confirmReceipt).mockResolvedValue({ success: true, message: 'Merci !' });
    const onChange = vi.fn();
    render(<OrderProtectionBox orderId="o1" protection={delivered} token="t" onChange={onChange} />);

    expect(screen.getByText(/avant le 27 octobre/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /bien reçu ma commande/ }));

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(confirmReceipt).toHaveBeenCalledWith('o1', 't');
  });

  it('signale un problème avec une description', async () => {
    vi.mocked(openDispute).mockResolvedValue({ success: true, message: 'Problème signalé.' });
    const onChange = vi.fn();
    render(<OrderProtectionBox orderId="o1" protection={delivered} token="t" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Signaler un problème/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    expect(screen.getByRole('alert')).toHaveTextContent('10 caractères');
    expect(openDispute).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Que s’est-il passé ?'), { target: { value: 'Le colis est arrivé abîmé.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(openDispute).toHaveBeenCalledWith('o1', 'Le colis est arrivé abîmé.', 't');
  });

  it("affiche le litige en cours et la réponse de l'équipe", () => {
    render(
      <OrderProtectionBox
        orderId="o1"
        protection={{ protection: 'refunded', disputeReason: 'Abîmé', disputeNote: 'Remboursé par MVola' }}
        token="t"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Remboursement accordé')).toBeInTheDocument();
    expect(screen.getByText(/Remboursé par MVola/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('isServedCity (paiement à la livraison)', () => {
  it('reconnaît la capitale sous ses noms courants', () => {
    expect(isServedCity('Tana', ['Antananarivo'])).toBe(true);
    expect(isServedCity('Antananarivo 101', ['Antananarivo'])).toBe(true);
    expect(isServedCity('Toamasina', ['Antananarivo'])).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import { requestPhoneCode } from '@/lib/api/auth';
import { PhoneLoginForm, formatMalagasyPhone } from './PhoneLogin';

vi.mock('next-auth/react', () => ({ signIn: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({
  NEEDS_PROFILE: 'NeedsProfile',
  requestPhoneCode: vi.fn(),
  getPhoneLoginStatus: vi.fn(),
  getCurrentUser: vi.fn(),
  linkPhone: vi.fn(),
}));

const signInMock = vi.mocked(signIn);
const requestMock = vi.mocked(requestPhoneCode);

beforeEach(() => {
  signInMock.mockReset();
  requestMock.mockReset();
  requestMock.mockResolvedValue({ success: true, expiresInSeconds: 600 });
});

async function reachCodeStep() {
  fireEvent.change(screen.getByLabelText('Numéro de mobile'), { target: { value: '0341234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Recevoir un code par SMS' }));
  return screen.findByLabelText('Code reçu au 034 12 345 67');
}

describe('PhoneLoginForm', () => {
  it('formate un numéro malgache pour l’affichage', () => {
    expect(formatMalagasyPhone('+261341234567')).toBe('034 12 345 67');
    expect(formatMalagasyPhone('12')).toBe('12');
  });

  it('envoie le code puis connecte le client', async () => {
    signInMock.mockResolvedValue({ ok: true, error: undefined } as any);
    const onSuccess = vi.fn();
    render(<PhoneLoginForm onSuccess={onSuccess} />);

    const codeInput = await reachCodeStep();
    expect(requestMock).toHaveBeenCalledWith('0341234567');
    fireEvent.change(codeInput, { target: { value: '12a3456' } });
    expect(codeInput).toHaveValue('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(signInMock).toHaveBeenCalledWith('phone', { phone: '0341234567', code: '123456', redirect: false });
  });

  it('demande le nom d’un nouveau client puis crée le compte', async () => {
    signInMock
      .mockResolvedValueOnce({ ok: false, error: 'NeedsProfile' } as any)
      .mockResolvedValueOnce({ ok: true, error: undefined } as any);
    const onSuccess = vi.fn();
    render(<PhoneLoginForm onSuccess={onSuccess} />);

    fireEvent.change(await reachCodeStep(), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    fireEvent.change(await screen.findByLabelText('Prénom'), { target: { value: 'Voahangy' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Rasoa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(signInMock).toHaveBeenLastCalledWith('phone', {
      phone: '0341234567',
      code: '123456',
      firstName: 'Voahangy',
      lastName: 'Rasoa',
      redirect: false,
    });
  });

  it('affiche l’erreur du backend et le code en mode démonstration', async () => {
    requestMock.mockResolvedValue({ success: true, expiresInSeconds: 600, demoCode: '654321' });
    signInMock.mockResolvedValue({ ok: false, error: 'Code incorrect' } as any);
    render(<PhoneLoginForm onSuccess={vi.fn()} />);

    fireEvent.change(await reachCodeStep(), { target: { value: '000000' } });
    expect(screen.getByText('654321')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect');
  });
});

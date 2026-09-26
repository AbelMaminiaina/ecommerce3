import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StarRating } from './StarRating';

describe('StarRating', () => {
  it('expose la note et le nombre d’avis aux lecteurs d’écran', () => {
    render(<StarRating value={4.3} count={12} />);
    expect(screen.getByRole('img', { name: 'Note : 4,3 sur 5 (12 avis)' })).toBeInTheDocument();
    expect(screen.getByText('4,3 (12)')).toBeInTheDocument();
  });

  it('affiche « Aucun avis » sans note, sans inventer de valeur', () => {
    render(<StarRating value={null} count={0} />);
    expect(screen.getByRole('img', { name: 'Aucun avis' })).toBeInTheDocument();
    expect(screen.getByText('Aucun avis')).toBeInTheDocument();
  });

  it('ignore une note non nulle quand il n’y a aucun avis', () => {
    render(<StarRating value={5} count={0} />);
    expect(screen.getByRole('img', { name: 'Aucun avis' })).toBeInTheDocument();
  });
});

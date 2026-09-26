import React from 'react';

interface StarRatingProps {
  /** Note moyenne sur 5 ; null/undefined = aucun avis. */
  value: number | null | undefined;
  count?: number;
  showCount?: boolean;
  /** Fait « sauter » les étoiles au survol de la carte produit (.product-item:hover .star-pop). */
  animated?: boolean;
  className?: string;
}

const formatRating = (n: number) => String(n).replace('.', ',');

// Étoiles Font Awesome (comme la maquette) avec remplissage fractionnaire :
// 4,3 -> quatre étoiles pleines + 30 % de la cinquième. Sans avis : étoiles grises.
export function StarRating({ value, count = 0, showCount = true, animated = false, className = '' }: StarRatingProps) {
  const hasRating = typeof value === 'number' && count > 0;
  const rating = hasRating ? Math.min(5, Math.max(0, value)) : 0;
  const label = hasRating ? `Note : ${formatRating(rating)} sur 5 (${count} avis)` : 'Aucun avis';

  return (
    <span className={`d-inline-flex align-items-center ${className}`}>
      <span role="img" aria-label={label} className="d-inline-flex">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.min(1, Math.max(0, rating - i));
          return (
            <span
              key={i}
              className={`rating-stars${animated ? ' star-pop' : ''}`}
              style={animated ? { animationDelay: `${i * 70}ms` } : undefined}
            >
              <i className="bi bi-star-fill" aria-hidden="true"></i>
              {fill > 0 && (
                <span className="rating-fill" style={{ width: `${fill * 100}%` }}>
                  <i className="bi bi-star-fill" aria-hidden="true"></i>
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showCount && (
        <small className="ms-2 text-muted">{hasRating ? `${formatRating(rating)} (${count})` : 'Aucun avis'}</small>
      )}
    </span>
  );
}

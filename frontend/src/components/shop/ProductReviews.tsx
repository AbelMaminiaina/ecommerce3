'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useCompanyAccess } from '@/hooks/useCompanyAccess';
import { getProductReviews, submitProductReview } from '@/lib/api/reviews';
import type { ProductReviews as ProductReviewsData } from '@/types';

// Avis d'un produit : chargement partagé entre la liste (onglet « Avis ») et le formulaire
// « Laisser un avis » de la page produit.
export function useProductReviews(slug: string) {
  const [data, setData] = useState<ProductReviewsData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await getProductReviews(slug));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [slug]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loadFailed, reload };
}

// Saisie de la note : cinq étoiles cliquables (survol = aperçu)
function RatingInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div role="radiogroup" aria-label="Votre note" className="d-flex align-items-center" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          className={`btn btn-link p-0 me-1 text-decoration-none review-star${n <= shown ? ' active' : ''}`}
        >
          <i className="bi bi-star-fill"></i>
        </button>
      ))}
    </div>
  );
}

// Formulaire « Laisser un avis » du template : un avis par compte et par produit.
export function ReviewForm({ slug, onSaved }: { slug: string; onSaved: () => void }) {
  const { status, accessToken, session } = useCompanyAccess();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isAdmin = status === 'platform_admin';
  const isLoggedIn = Boolean(accessToken) && !isAdmin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || rating < 1) {
      setError('Choisissez une note de 1 à 5 étoiles.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await submitProductReview(slug, { rating, comment: comment.trim() || undefined }, accessToken);
      setSaved(true);
      setComment('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer votre avis.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="avis" className="sw-anchor">
      <h4 className="mb-4 fw-bold">Laisser un avis</h4>
      {isAdmin ? (
        <p className="mb-0">Les comptes administrateurs ne peuvent pas noter les produits.</p>
      ) : !isLoggedIn ? (
        <p className="mb-0">
          <Link href={`/connexion?callbackUrl=/produits/${slug}`} className="text-primary fw-bold">
            Connectez-vous
          </Link>{' '}
          pour noter ce produit.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="row g-4">
            <div className="col-lg-12">
              <p className="small mb-0">
                {session?.user?.name ? `${session.user.name}, ` : ''}
                votre note et votre commentaire seront publics. Un nouvel avis remplace le précédent.
              </p>
            </div>
            <div className="col-lg-12">
              <div className="border-bottom rounded">
                <textarea
                  id="review-comment"
                  className="form-control border-0"
                  cols={30}
                  rows={6}
                  maxLength={1000}
                  placeholder="Votre avis (facultatif)"
                  aria-label="Votre avis"
                  spellCheck={false}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>
            <div className="col-lg-12">
              <div className="d-flex justify-content-between align-items-center py-3 mb-3 flex-wrap gap-3">
                <div className="d-flex align-items-center">
                  <p className="mb-0 me-3">Votre note :</p>
                  <RatingInput value={rating} onChange={setRating} />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary border border-secondary text-primary rounded-pill px-4 py-3"
                >
                  {submitting ? 'Envoi…' : "Publier l'avis"}
                </button>
              </div>
              {error && <p role="alert" className="text-danger small mb-0">{error}</p>}
              {saved && !error && <p role="status" className="text-success small fw-bold mb-0">Merci ! Votre avis a été enregistré.</p>}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

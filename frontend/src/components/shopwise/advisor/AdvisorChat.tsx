'use client';

import React, { useState } from 'react';
import { askAdvisor, type AdvisorResponse } from '@/lib/api/advisor';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { AdvisorProductRow } from './AdvisorProductRow';

const SUGGESTIONS = [
  "J'équipe un petit atelier de bricolage",
  'Je rénove une salle de bain',
  'Des fournitures pour ouvrir une boutique',
];

interface AdvisorChatProps {
  // Panneau étroit : toujours la liste compacte, jamais la grille de grandes cartes
  compact?: boolean;
  onNavigate?: () => void;
}

// Formulaire + réponse du conseiller IA, partagé par la section de page et le panneau flottant
export function AdvisorChat({ compact = false, onNavigate }: AdvisorChatProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AdvisorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || loading) return;

    setQuestion(trimmed);
    setLoading(true);
    setError(null);
    try {
      setAnswer(await askAdvisor(trimmed));
    } catch (err) {
      setAnswer(null);
      setError(err instanceof Error ? err.message : 'Le conseiller est indisponible pour le moment');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(question);
  };

  const rows = answer && (
    <div className="sw-advisor-rows">
      {answer.products.map((product) => (
        <AdvisorProductRow key={product.id} product={product} onNavigate={onNavigate} />
      ))}
    </div>
  );

  return (
    <div className={`sw-advisor${compact ? ' compact' : ''}`}>
      <form onSubmit={handleSubmit} className="sw-advisor-form">
        <div className="sw-advisor-field">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="Ex. : équiper un atelier de menuiserie"
            aria-label="Votre question au conseiller"
          />
          <button type="submit" className="sw-btn-primary" disabled={loading || question.trim().length < 3}>
            {loading ? (
              <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
            ) : (
              <i className="bi bi-send"></i>
            )}
            Conseillez-moi
          </button>
        </div>

        <div className="sw-advisor-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} disabled={loading}>
              {s}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <p role="alert" className="sw-advisor-error">
          {error}
        </p>
      )}

      <div className="sw-advisor-answer" aria-live="polite">
        {loading && <p className="sw-advisor-thinking">Le conseiller réfléchit…</p>}
        {answer && !loading && (
          <>
            <p className="sw-advisor-message">{answer.message}</p>
            {answer.products.length > 0 &&
              (compact ? (
                rows
              ) : (
                <>
                  {/* Téléphone : liste compacte ; tablette et ordinateur : grille de cartes */}
                  <div className="d-md-none">{rows}</div>
                  <div className="d-none d-md-block">
                    <ProductGrid products={answer.products} />
                  </div>
                </>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

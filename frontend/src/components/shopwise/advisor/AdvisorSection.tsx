import React from 'react';
import { AdvisorChat } from './AdvisorChat';

interface AdvisorSectionProps {
  className?: string;
}

// Section « Besoin d'un conseil ? » intégrée aux pages (accueil, catalogue).
// data-advisor-section : le bouton flottant se cache quand cette section est à l'écran.
export function AdvisorSection({ className = 'sw-section sw-advisor-section' }: AdvisorSectionProps) {
  return (
    <section id="conseiller" className={className} data-advisor-section>
      <div className="container sw-section-title">
        <span className="sw-advisor-kicker">
          <i className="bi bi-stars"></i>Conseiller Tsena
        </span>
        <h2>Besoin d&apos;un conseil&nbsp;?</h2>
        <p>Décrivez votre projet ou votre besoin, notre conseiller vous propose les produits adaptés.</p>
      </div>
      <div className="container">
        <AdvisorChat />
      </div>
    </section>
  );
}

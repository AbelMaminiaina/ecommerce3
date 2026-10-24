'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AdvisorChat } from './AdvisorChat';

// Pages où le bouton flottant gênerait (tunnel de commande, connexion)
const HIDDEN_PREFIXES = ['/checkout', '/panier', '/connexion', '/inscription'];

// Bouton « Conseil » en bas d'écran, sur toutes les pages de la boutique : ouvre le conseiller en panneau
export function AdvisorLauncher() {
  const pathname = usePathname();
  // Panneau et visibilité de la section rattachés à la page : changer de page (vers une fiche produit…)
  // ferme le panneau et oublie l'état de la section précédente
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [sectionOn, setSectionOn] = useState<string | null>(null);
  const isOpen = openOn === pathname;
  const sectionVisible = sectionOn === pathname;
  const setIsOpen = (open: boolean) => setOpenOn(open ? pathname : null);

  // Bouton inutile quand la section du conseiller est déjà à l'écran
  useEffect(() => {
    const sections = document.querySelectorAll('[data-advisor-section]');
    if (sections.length === 0) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
      setSectionOn(visible.size > 0 ? pathname : null);
    });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (HIDDEN_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return null;

  return (
    <>
      {!isOpen && !sectionVisible && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="sw-advisor-launcher"
          aria-label="Ouvrir le conseiller Tsena"
        >
          <i className="bi bi-stars"></i>
          {/* Téléphone : icône seule, pour ne pas masquer les boutons de la page */}
          <span className="d-none d-sm-inline">Conseil</span>
        </button>
      )}

      {isOpen && (
        <>
          <div className="sw-advisor-backdrop" onClick={() => setIsOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="advisor-panel-title" className="sw-advisor-panel">
            <div className="sw-advisor-panel-head">
              <h2 id="advisor-panel-title">
                <i className="bi bi-stars"></i>Conseiller Tsena
              </h2>
              <button type="button" onClick={() => setIsOpen(false)} className="sw-icon-btn" aria-label="Fermer le conseiller">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="sw-advisor-panel-body">
              <p>Décrivez votre besoin, notre conseiller vous propose les produits adaptés.</p>
              <AdvisorChat compact onNavigate={() => setIsOpen(false)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

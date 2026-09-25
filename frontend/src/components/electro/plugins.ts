'use client';

import { useEffect, type RefObject } from 'react';

// Bibliothèques JS du template Electro (public/electro), chargées dans l'ordre et une seule fois :
// jQuery -> Bootstrap (dropdowns, collapse, onglets) -> Owl Carousel -> WOW.
const SCRIPTS = [
  '/electro/js/jquery.min.js',
  '/electro/js/bootstrap.bundle.min.js',
  '/electro/lib/owlcarousel/owl.carousel.min.js',
  '/electro/lib/wow/wow.min.js',
];

let loading: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Impossible de charger ${src}`));
    document.body.appendChild(script);
  });
}

export function loadElectroPlugins(): Promise<void> {
  if (!loading) {
    loading = SCRIPTS.reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve());
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

type JQueryStatic = any;

declare global {
  interface Window {
    jQuery?: JQueryStatic;
    WOW?: new (options?: Record<string, unknown>) => { init: () => void };
  }
}

// Options de main.js, sauf le changement de slide : fondu (animateOut, animate.css) au lieu du glissement, pour que
// l'animation d'entrée de chaque slide (image depuis la gauche, texte depuis la droite : electro-extra.css) se joue sur
// place et soit bien visible.
export const HEADER_CAROUSEL_OPTIONS = {
  autoplay: true,
  autoplayTimeout: 6000,
  smartSpeed: 1000,
  animateOut: 'fadeOut',
  dots: false,
  loop: true,
  margin: 25,
  nav: true,
  navText: ['<i class="bi bi-arrow-left"></i>', '<i class="bi bi-arrow-right"></i>'],
  responsiveClass: true,
  responsive: { 0: { items: 1 }, 576: { items: 1 }, 768: { items: 1 }, 992: { items: 1 }, 1200: { items: 1 } },
};

// Carrousel « Related Product » : options de main.js, mais sans boucle (loop) : Owl clonerait les
// cartes et les boutons des clones (panier, favoris) ne seraient plus reliés à React.
export const RELATED_CAROUSEL_OPTIONS = {
  autoplay: true,
  autoplayHoverPause: true,
  smartSpeed: 1500,
  dots: false,
  loop: false,
  rewind: true,
  margin: 25,
  nav: true,
  navText: ['<i class="fas fa-chevron-left"></i>', '<i class="fas fa-chevron-right"></i>'],
  responsiveClass: true,
  responsive: { 0: { items: 1 }, 576: { items: 1 }, 768: { items: 2 }, 992: { items: 3 }, 1200: { items: 4 } },
};

// Galerie de la page produit (« Single Products carousel » de main.js) : vignettes en pastilles
// (dotsData). Le défilement automatique se met en pause au survol.
export const SINGLE_CAROUSEL_OPTIONS = {
  autoplay: true,
  autoplayHoverPause: true,
  smartSpeed: 1500,
  dots: true,
  dotsData: true,
  loop: true,
  items: 1,
  nav: true,
  navText: ['<i class="bi bi-arrow-left"></i>', '<i class="bi bi-arrow-right"></i>'],
};

export const TESTIMONIAL_CAROUSEL_OPTIONS = {
  autoplay: true,
  smartSpeed: 1500,
  dots: true,
  loop: true,
  margin: 25,
  nav: false,
  responsive: { 0: { items: 1 }, 768: { items: 2 }, 1200: { items: 3 } },
};

/**
 * Initialise Owl Carousel sur un conteneur dont les enfants sont rendus une seule fois par React
 * (Owl réorganise le DOM : les enfants ne doivent pas changer pendant la vie du carrousel).
 */
export function useOwlCarousel(ref: RefObject<HTMLElement>, options: Record<string, unknown>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let $el: JQueryStatic | null = null;

    loadElectroPlugins()
      .then(() => {
        if (cancelled || !ref.current || !window.jQuery) return;
        $el = window.jQuery(ref.current);
        $el.owlCarousel(options);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if ($el) {
        try {
          $el.trigger('destroy.owl.carousel');
        } catch {
          // le nœud peut déjà avoir été retiré du DOM
        }
      }
    };
    // Les options sont des constantes de module : elles ne changent pas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CONTACT, CONTACT_ADDRESS_INLINE, CONTACT_MAILTO, CONTACT_PHONE_LINKS } from '@/lib/contact';

const COLUMNS = [
  {
    title: 'Boutique',
    links: [
      { name: 'Tous les produits', href: '/produits' },
      { name: 'Nos vendeurs', href: '/vendeurs' },
      { name: 'Mes favoris', href: '/favoris' },
      { name: 'Mon panier', href: '/panier' },
      { name: 'Devenir client pro', href: '/inscription' },
    ],
  },
  {
    title: 'Aide',
    links: [
      { name: 'Suivi de commande', href: '/suivi-commande' },
      { name: 'Livraison', href: '/services#livraison' },
      { name: 'Paiement Mobile Money', href: '/services#paiement' },
      { name: 'Blog & conseils', href: '/blog' },
      { name: 'Nous contacter', href: '/contact' },
    ],
  },
  {
    title: 'Informations',
    links: [
      { name: 'Mentions légales', href: '/mentions-legales' },
      { name: 'Politique de confidentialité', href: '/politique-confidentialite' },
      { name: 'Conditions générales de vente', href: '/cgv' },
      { name: 'Politique de livraison', href: '/cgv#livraison' },
    ],
  },
];

// Pied de page du template ShopWise : newsletter, colonnes de liens, moyens de paiement, mentions.
export function ShopwiseFooter() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 100);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: brancher l'inscription à la newsletter sur le backend
    setSubscribed(true);
    setEmail('');
  };

  return (
    <footer id="footer" className="sw-footer">
      <div className="sw-newsletter">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-8">
              <h2>Inscrivez-vous à notre newsletter</h2>
              <p>Recevez nos nouveautés catalogue, nos offres tarifaires et les actualités de la plateforme.</p>
              {subscribed ? (
                <p className="sw-newsletter-ok">Merci pour votre inscription ! Vous recevrez bientôt nos actualités.</p>
              ) : (
                <form className="sw-newsletter-form" onSubmit={handleSubmit}>
                  <input
                    type="email"
                    required
                    placeholder="Votre adresse e-mail"
                    aria-label="Votre adresse e-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button type="submit">S&apos;abonner</button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sw-footer-main">
        <div className="container">
          <div className="row gy-4">
            <div className="col-lg-3 col-md-6">
              <div className="sw-footer-widget">
                <Link href="/" className="sw-footer-logo">Tsena Pro</Link>
                <p>
                  La plateforme de vente en gros : smartphones, ordinateurs, photo et accessoires, avec des tarifs
                  dégressifs pour les professionnels.
                </p>
                <div className="sw-contact-item">
                  <i className="bi bi-geo-alt"></i>
                  <span>{CONTACT_ADDRESS_INLINE}</span>
                </div>
                <div className="sw-contact-item">
                  <i className="bi bi-telephone"></i>
                  <span>
                    {CONTACT_PHONE_LINKS.map((phone, index) => (
                      <React.Fragment key={phone.href}>
                        {index > 0 && ' · '}
                        <a href={phone.href}>{phone.display}</a>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
                <div className="sw-contact-item">
                  <i className="bi bi-envelope"></i>
                  <a href={CONTACT_MAILTO}>{CONTACT.email}</a>
                </div>
              </div>
            </div>

            {COLUMNS.map((column) => (
              <div key={column.title} className="col-lg-2 col-md-6 col-sm-6">
                <div className="sw-footer-widget">
                  <h4>{column.title}</h4>
                  <ul className="sw-footer-links">
                    {column.links.map((link) => (
                      <li key={link.name}>
                        <Link href={link.href}>{link.name}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}

            <div className="col-lg-3 col-md-6 col-sm-6">
              <div className="sw-footer-widget">
                <h4>Paiement sécurisé</h4>
                <p>Réglez vos commandes par Mobile Money, en toute simplicité.</p>
                <div className="sw-pay-badges">
                  <span><i className="bi bi-phone"></i>MVola</span>
                  <span><i className="bi bi-phone"></i>Orange Money</span>
                  <span><i className="bi bi-phone"></i>Airtel Money</span>
                </div>
                <div className="mt-4">
                  <h5>Horaires</h5>
                  <p className="mb-0">Lun - Ven : 9h - 18h · Sam : 9h - 12h</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sw-footer-bottom">
        <div className="container">
          <div className="sw-payment-methods">
            <span>Nous acceptons :</span>
            <i className="bi bi-phone" aria-label="Mobile Money"></i>
            <i className="bi bi-bank" aria-label="Virement bancaire"></i>
            <i className="bi bi-cash" aria-label="Espèces"></i>
            <i className="bi bi-truck" aria-label="Paiement à la livraison"></i>
          </div>
          <div className="sw-legal">
            <Link href="/cgv">Conditions générales de vente</Link>
            <Link href="/politique-confidentialite">Politique de confidentialité</Link>
            <Link href="/mentions-legales">Mentions légales</Link>
          </div>
          <p className="sw-copyright">
            © {new Date().getFullYear()} <strong>Tsena Pro</strong>. Tous droits réservés.
          </p>
        </div>
      </div>

      <button
        type="button"
        className={`sw-scroll-top${showTop ? ' active' : ''}`}
        aria-label="Retour en haut"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <i className="bi bi-arrow-up-short"></i>
      </button>
    </footer>
  );
}

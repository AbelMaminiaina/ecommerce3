'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { services, faqItems } from '@/data/services';
import { PageHeader } from '@/components/shop/PageHeader';
import { RichText } from '@/components/shopwise/RichText';
import { CONTACT, CONTACT_MAILTO, CONTACT_PHONE_LINKS } from '@/lib/contact';

const ICONS: Record<string, string> = {
  Truck: 'bi-truck',
  CreditCard: 'bi-phone',
  Building2: 'bi-building',
  MessageCircle: 'bi-chat-dots',
};

const CATEGORIES = [
  {
    slug: 'mobiles',
    title: 'Mobiles & Smartphones',
    text: 'Smartphones et tablettes, vendus à la pièce avec des tarifs dégressifs dès 10 pièces.',
    image: '/electro/img/product-banner.jpg',
  },
  {
    slug: 'ordinateurs',
    title: 'Ordinateurs & Écrans',
    text: 'Portables, écrans et packs bureau pour équiper vos équipes.',
    image: '/electro/img/product-banner-2.jpg',
  },
];

const RESOURCES = [
  { href: '/suivi-commande', icon: 'bi-box-seam', title: 'Suivi de commande', text: 'Statut de vos commandes et paiements' },
  { href: '/inscription', icon: 'bi-building-add', title: 'Devenir client pro', text: 'Inscription et validation du compte' },
  { href: '/blog', icon: 'bi-journal-text', title: 'Blog & conseils', text: 'Guides pour vos achats en gros' },
  { href: '/cgv', icon: 'bi-file-earmark-text', title: 'Conditions de vente', text: 'Livraison, paiement, réclamations' },
];

// Page « Nos services » dans le style du centre d'aide ShopWise (support.html) : canaux de contact,
// services par thème, détail de chaque service, ressources et questions fréquentes.
export default function ServicesPage() {
  const [openFaq, setOpenFaq] = useState<string | null>(faqItems[0]?.id ?? null);
  const phone = CONTACT_PHONE_LINKS[0];

  return (
    <>
      <PageHeader
        title="Nos services"
        crumbs={[{ label: 'Services' }]}
        description="Livraison, paiement Mobile Money, compte professionnel et support : tout ce qui accompagne vos achats en gros."
      />

      <section className="sw-section sw-support">
        <div className="container">
          {/* Canaux de contact */}
          <div className="row g-3 mb-5">
            <div className="col-lg-4 col-md-6">
              <div className="contact-card">
                <div className="contact-card-header">
                  <i className="bi bi-envelope"></i>
                  <h5>Écrivez-nous</h5>
                </div>
                <p>Une question sur une commande, un paiement ou un produit ? Réponse sous 24 h ouvrées en moyenne.</p>
                <a href={CONTACT_MAILTO} className="card-action">
                  {CONTACT.email} <i className="bi bi-arrow-right"></i>
                </a>
              </div>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="contact-card">
                <div className="contact-card-header">
                  <i className="bi bi-telephone"></i>
                  <h5>Appelez-nous</h5>
                </div>
                <p>Notre équipe vous répond du lundi au samedi, aux heures d&apos;ouverture.</p>
                {phone && (
                  <a href={phone.href} className="card-action">
                    {phone.display} <i className="bi bi-arrow-right"></i>
                  </a>
                )}
              </div>
            </div>
            <div className="col-lg-4 col-md-12">
              <div className="contact-card">
                <div className="contact-card-header">
                  <i className="bi bi-chat-dots"></i>
                  <h5>Formulaire de contact</h5>
                </div>
                <p>Demande de tarifs pour de gros volumes, partenariat ou réclamation : envoyez-nous un message détaillé.</p>
                <Link href="/contact" className="card-action">
                  Nous contacter <i className="bi bi-arrow-right"></i>
                </Link>
              </div>
            </div>
          </div>

          {/* Services par thème */}
          <div className="topics-section">
            <div className="topics-header">
              <h3>Nos services</h3>
              <p>Tout ce qui accompagne vos achats, de l&apos;inscription à la livraison</p>
            </div>
            <div className="row g-3">
              {services.map((service) => (
                <div key={service.id} className="col-lg-3 col-md-6">
                  <a href={`#${service.slug}`} className="topic-card">
                    <div className="topic-icon-wrap">
                      <i className={`bi ${ICONS[service.icon] ?? 'bi-check2-circle'}`}></i>
                    </div>
                    <div className="topic-body">
                      <h5>{service.title}</h5>
                      <ul>
                        {service.features.slice(0, 3).map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                    </div>
                    <span className="topic-arrow"><i className="bi bi-chevron-right"></i></span>
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Détail des services */}
          <div className="service-details">
            {services.map((service) => (
              <article key={service.id} id={service.slug} className="service-detail">
                <div className="row g-4">
                  <div className="col-lg-8">
                    <div className="service-detail-head">
                      <span className="service-icon"><i className={`bi ${ICONS[service.icon] ?? 'bi-check2-circle'}`}></i></span>
                      <div>
                        <h2>{service.title}</h2>
                        <p>{service.description}</p>
                      </div>
                    </div>
                    <RichText content={service.longDescription} />
                  </div>
                  <div className="col-lg-4">
                    <div className="service-aside">
                      <h4><i className="bi bi-check2-square"></i> En bref</h4>
                      <ul>
                        {service.features.map((feature) => (
                          <li key={feature}><i className="bi bi-check2-circle"></i> {feature}</li>
                        ))}
                      </ul>
                      {service.pricing && (
                        <div className="service-pricing">
                          <span>Tarif</span>
                          <strong>{service.pricing}</strong>
                        </div>
                      )}
                      <Link href="/contact" className="sw-btn-primary w-100 justify-content-center">
                        Nous contacter <i className="bi bi-arrow-right"></i>
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Catégories phares */}
          <div className="topics-section">
            <div className="topics-header">
              <h3>Nos catégories phares</h3>
              <p>Smartphones, ordinateurs et écrans, pour les entreprises, les boutiques et les revendeurs</p>
            </div>
            <div className="row g-4">
              {CATEGORIES.map((category) => (
                <div key={category.slug} className="col-md-6">
                  <Link href={`/produits?categorie=${category.slug}`} className="sw-category-card sw-category-wide">
                    <div className="sw-category-img">
                      <Image src={category.image} alt={category.title} width={800} height={450} sizes="(max-width: 768px) 100vw, 50vw" />
                    </div>
                    <div className="sw-category-body">
                      <h4>{category.title}</h4>
                      <span>{category.text}</span>
                    </div>
                    <div className="sw-category-action">
                      <span>Voir les produits <i className="bi bi-arrow-right"></i></span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Ressources & FAQ */}
          <div id="faq" className="row g-4 mt-4">
            <div className="col-lg-4">
              <div className="resources-panel">
                <h3>Ressources utiles</h3>
                <p>Pour trouver une réponse par vous-même</p>
                <div className="resource-list">
                  {RESOURCES.map((resource) => (
                    <Link key={resource.href} href={resource.href} className="resource-item">
                      <div className="resource-icon"><i className={`bi ${resource.icon}`}></i></div>
                      <div className="resource-text">
                        <h6>{resource.title}</h6>
                        <span>{resource.text}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <div className="col-lg-8">
              <div className="faq-panel">
                <h3>Questions fréquentes</h3>
                <div className="faq-list">
                  {faqItems.map((item) => {
                    const open = openFaq === item.id;
                    return (
                      <div key={item.id} className={`faq-item${open ? ' faq-active' : ''}`}>
                        <h3>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={`faq-${item.id}`}
                            onClick={() => setOpenFaq(open ? null : item.id)}
                          >
                            {item.question}
                            <i className="bi bi-chevron-down faq-toggle" aria-hidden="true"></i>
                          </button>
                        </h3>
                        <div id={`faq-${item.id}`} className="faq-answer" hidden={!open}>
                          <p>{item.answer}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="faq-more">
                  Vous ne trouvez pas la réponse à votre question ? <Link href="/contact">Contactez-nous</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

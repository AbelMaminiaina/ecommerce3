'use client';

import { CONTACT, CONTACT_ADDRESS_INLINE, CONTACT_MAILTO, CONTACT_MAP_EMBED_URL, CONTACT_PHONE_LINKS, SOCIAL_LINKS } from '@/lib/contact';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/shop/PageHeader';

const contactSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  phone: z.string().optional(),
  subject: z.string().min(1, 'Veuillez sélectionner un sujet'),
  message: z.string().min(10, 'Le message doit contenir au moins 10 caractères'),
});

type ContactFormData = z.infer<typeof contactSchema>;

const subjectOptions = [
  { value: 'compte', label: 'Demande de compte professionnel' },
  { value: 'commande', label: 'Suivi de commande' },
  { value: 'facturation', label: 'Question sur un paiement' },
  { value: 'produit', label: 'Question sur un produit' },
  { value: 'partenariat', label: 'Partenariat' },
  { value: 'autre', label: 'Autre demande' },
];

// Page contact du template ShopWise (contact.html, section « Contact 2 ») : cartes de coordonnées,
// formulaire, carte Google et réseaux sociaux.
export default function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'invalid' | 'success' | 'error'>('idle');
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (data: ContactFormData) => {
    setIsLoading(true);
    try {
      // TODO: Implement API call
      void data;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setStatus('success');
      reset();
    } catch (error) {
      console.error('Error submitting form:', error);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const fieldClass = (base: string, hasError: boolean) => `${base}${hasError ? ' is-invalid' : ''}`;

  return (
    <>
      <PageHeader title="Contact" crumbs={[{ label: 'Contact' }]} />

      <section id="contact-2" className="sw-section contact-2">
        <div className="container">

          {/* Coordonnées */}
          <div className="row g-3 mb-5">
            <div className="col-lg-4 col-md-6">
              <div className="info-card">
                <div className="info-card-icon"><i className="bi bi-pin-map"></i></div>
                <div className="info-card-body">
                  <h5>Notre adresse</h5>
                  <p>{CONTACT_ADDRESS_INLINE}</p>
                </div>
              </div>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="info-card">
                <div className="info-card-icon"><i className="bi bi-envelope"></i></div>
                <div className="info-card-body">
                  <h5>Écrivez-nous</h5>
                  <p><a href={CONTACT_MAILTO}>{CONTACT.email}</a></p>
                  {CONTACT_PHONE_LINKS.map((phone) => (
                    <p key={phone.href}><a href={phone.href}>{phone.display}</a></p>
                  ))}
                </div>
              </div>
            </div>
            <div className="col-lg-4 col-md-12">
              <div className="info-card">
                <div className="info-card-icon"><i className="bi bi-clock"></i></div>
                <div className="info-card-body">
                  <h5>Horaires</h5>
                  <p>Lun - Ven : 9 h - 18 h</p>
                  <p>Sam : 9 h - 12 h</p>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-4 align-items-start">
            {/* Formulaire */}
            <div className="col-lg-7">
              <div className="form-card">
                <div className="form-card-header">
                  <h3>Envoyez-nous un message</h3>
                  <p>Une question sur une commande, un produit ou un compte professionnel ? Nous vous répondons sous 24 h ouvrées.</p>
                </div>
                <form onSubmit={handleSubmit(onSubmit, () => setStatus('invalid'))} noValidate>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="ct-name">Nom complet</label>
                      <input type="text" className={fieldClass('form-control', !!errors.name)} id="ct-name" placeholder="Jean Rakoto" autoComplete="name" {...register('name')} />
                      {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="ct-email">Adresse e-mail</label>
                      <input type="email" className={fieldClass('form-control', !!errors.email)} id="ct-email" placeholder="jean@exemple.mg" autoComplete="email" {...register('email')} />
                      {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="ct-phone">Téléphone</label>
                      <input type="tel" className="form-control" id="ct-phone" placeholder="034 00 000 00" autoComplete="tel" {...register('phone')} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="ct-subject">Sujet</label>
                      <select className={fieldClass('form-select', !!errors.subject)} id="ct-subject" defaultValue="" {...register('subject')}>
                        <option value="">Choisissez un sujet</option>
                        {subjectOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {errors.subject && <div className="invalid-feedback">{errors.subject.message}</div>}
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="ct-message">Message</label>
                      <textarea className={fieldClass('form-control', !!errors.message)} id="ct-message" rows={5} placeholder="Écrivez votre message…" {...register('message')} />
                      {errors.message && <div className="invalid-feedback">{errors.message.message}</div>}
                    </div>
                    {status !== 'idle' && (
                      <div className="col-12">
                        {status === 'success' ? (
                          <div className="alert alert-success mb-0" role="status">
                            Merci ! Votre message a bien été envoyé. Nous vous répondrons dans les plus brefs délais.
                          </div>
                        ) : (
                          <div className="alert alert-danger mb-0" role="alert">
                            {status === 'invalid'
                              ? 'Merci de compléter les champs signalés en rouge (message de 10 caractères minimum).'
                              : "Impossible d'envoyer le message pour le moment. Réessayez plus tard."}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="col-12">
                      <button type="submit" className="btn-submit" disabled={isLoading}>
                        {isLoading && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
                        Envoyer le message
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>

            {/* Carte et réseaux */}
            <div className="col-lg-5">
              <div className="map-card">
                <iframe
                  src={CONTACT_MAP_EMBED_URL}
                  width="100%"
                  height="100%"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Plan d'accès"
                />
              </div>
              <div className="connect-card">
                <h5>Suivez-nous</h5>
                <p>Nouveautés catalogue, offres tarifaires et actualités de la plateforme : retrouvez-nous sur les réseaux sociaux.</p>
                <div className="social-row">
                  {SOCIAL_LINKS.map((social) => (
                    <a
                      key={social.label}
                      href={social.href}
                      {...(social.href !== '#' && { target: '_blank', rel: 'noopener noreferrer' })}
                      aria-label={social.label}
                    >
                      <i className={`bi ${social.icon}`}></i>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>
    </>
  );
}

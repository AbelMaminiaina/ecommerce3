import { Metadata } from 'next';
import { PageHeader } from '@/components/shop/PageHeader';
import { getMobileAppLinks } from '@/lib/mobileApp';

export const metadata: Metadata = {
  title: 'Application mobile',
  description:
    'Téléchargez l’application Tsena pour Android et iPhone : catalogue, commande en gros et paiement Mobile Money depuis votre téléphone.',
};

// Liens lus à chaque requête (variables d'environnement du serveur, voir lib/mobileApp.ts)
export const dynamic = 'force-dynamic';

const FEATURES = [
  { icon: 'bi-grid', title: 'Tout le catalogue', text: 'Recherche, catégories et fiches produits, même avec une connexion faible.' },
  { icon: 'bi-phone', title: 'Paiement Mobile Money', text: 'MVola, Orange Money et Airtel Money, confirmés directement sur votre téléphone.' },
  { icon: 'bi-truck', title: 'Suivi des commandes', text: 'Statut de chaque commande et de son paiement, en temps réel.' },
  { icon: 'bi-heart', title: 'Favoris et panier', text: 'Gardés sur votre téléphone, retrouvés à chaque ouverture.' },
];

export default function ApplicationPage() {
  const { android, androidIsApk, ios } = getMobileAppLinks();

  return (
    <>
      <PageHeader title="Application mobile" crumbs={[{ label: 'Application mobile' }]} />
      <section className="sw-section">
        <div className="container">
          <div className="sw-app-download">
            <h2>Tsena dans votre poche</h2>
            <p className="lead">
              Commandez en gros et payez par Mobile Money depuis votre téléphone, avec le même compte que sur le site.
            </p>

            <div className="sw-app-buttons">
              {android ? (
                <a href={android} className="sw-app-button" {...(androidIsApk ? { download: true } : { target: '_blank', rel: 'noopener' })}>
                  <i className="bi bi-android2" aria-hidden="true"></i>
                  <span>
                    <small>{androidIsApk ? 'Télécharger pour' : 'Disponible sur'}</small>
                    {androidIsApk ? 'Android (APK)' : 'Google Play'}
                  </span>
                </a>
              ) : (
                <span className="sw-app-button is-soon" aria-disabled="true">
                  <i className="bi bi-android2" aria-hidden="true"></i>
                  <span>
                    <small>Bientôt disponible</small>
                    Android
                  </span>
                </span>
              )}

              {ios ? (
                <a href={ios} className="sw-app-button" target="_blank" rel="noopener">
                  <i className="bi bi-apple" aria-hidden="true"></i>
                  <span>
                    <small>Télécharger dans</small>
                    l’App Store
                  </span>
                </a>
              ) : (
                <span className="sw-app-button is-soon" aria-disabled="true">
                  <i className="bi bi-apple" aria-hidden="true"></i>
                  <span>
                    <small>Bientôt disponible</small>
                    iPhone
                  </span>
                </span>
              )}
            </div>

            {androidIsApk ? (
              <p className="sw-app-note">
                Android : à l’ouverture du fichier, autorisez l’installation depuis votre navigateur si votre téléphone le demande.
              </p>
            ) : null}
          </div>

          <div className="row gy-4 mt-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="col-lg-3 col-md-6">
                <div className="sw-app-feature">
                  <i className={`bi ${f.icon}`} aria-hidden="true"></i>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

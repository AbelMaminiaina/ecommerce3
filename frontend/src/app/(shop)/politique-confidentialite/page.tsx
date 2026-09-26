import { Metadata } from 'next';
import { PageHeader } from '@/components/shop/PageHeader';
import { CONTACT, CONTACT_ADDRESS_INLINE } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Politique de Confidentialité',
  description: 'Politique de confidentialité et protection des données de Tsena Pro',
};

export default function PolitiqueConfidentialitePage() {
  return (
    <>
      <PageHeader title="Politique de Confidentialité" crumbs={[{ label: "Politique de Confidentialité" }]} />
      <section className="sw-section">
        <div className="container">
          <div className="sw-legal-doc sw-richtext">
          <p className="lead">
            Tsena Pro s&apos;engage à protéger la vie privée des utilisateurs de
            son site web. Cette politique de confidentialité explique comment nous
            collectons, utilisons et protégeons vos données personnelles.
          </p>

          <h2>1. Responsable du traitement</h2>
          <p>
            Le responsable du traitement des données est :<br />
            <strong>Tsena Pro</strong><br />
            {CONTACT_ADDRESS_INLINE}<br />
            Email : {CONTACT.email}<br />
            Téléphone : {CONTACT.phones.map((p) => p.display).join(' / ')}
          </p>

          <h2>2. Données collectées</h2>
          <p>Nous collectons les données suivantes :</p>
          <ul>
            <li><strong>Données d&apos;identification :</strong> nom, prénom, adresse email, numéro de téléphone</li>
            <li><strong>Données de livraison :</strong> adresse postale</li>
            <li><strong>Données de paiement :</strong> traitées de manière sécurisée par nos prestataires</li>
            <li><strong>Données de navigation :</strong> adresse IP, cookies, pages visitées</li>
            <li><strong>Données de commande :</strong> historique des achats</li>
          </ul>

          <h2>3. Finalités du traitement</h2>
          <p>Vos données sont collectées pour les finalités suivantes :</p>
          <ul>
            <li>Gestion de vos commandes et livraisons</li>
            <li>Traitement des paiements</li>
            <li>Communication relative à vos commandes</li>
            <li>Envoi de notre newsletter (avec votre consentement)</li>
            <li>Amélioration de nos services et de votre expérience utilisateur</li>
            <li>Respect de nos obligations légales</li>
          </ul>

          <h2>4. Base légale du traitement</h2>
          <p>Le traitement de vos données repose sur :</p>
          <ul>
            <li>L&apos;exécution du contrat (commandes)</li>
            <li>Votre consentement (newsletter, cookies non essentiels)</li>
            <li>Notre intérêt légitime (amélioration des services)</li>
            <li>Le respect de nos obligations légales</li>
          </ul>

          <h2>5. Durée de conservation</h2>
          <p>Vos données sont conservées :</p>
          <ul>
            <li><strong>Données clients :</strong> 3 ans après la dernière commande</li>
            <li><strong>Données de facturation :</strong> 10 ans (obligation légale)</li>
            <li><strong>Données de newsletter :</strong> jusqu&apos;à désinscription</li>
            <li><strong>Cookies :</strong> 13 mois maximum</li>
          </ul>

          <h2>6. Destinataires des données</h2>
          <p>Vos données peuvent être transmises à :</p>
          <ul>
            <li>Nos équipes internes</li>
            <li>Nos prestataires de paiement</li>
            <li>Nos prestataires de livraison</li>
            <li>Nos prestataires d&apos;hébergement et services techniques</li>
          </ul>
          <p>
            Nous ne vendons jamais vos données personnelles à des tiers.
          </p>

          <h2>7. Vos droits</h2>
          <p>Vous disposez des droits suivants :</p>
          <ul>
            <li><strong>Droit d&apos;accès :</strong> obtenir une copie de vos données</li>
            <li><strong>Droit de rectification :</strong> corriger vos données inexactes</li>
            <li><strong>Droit à l&apos;effacement :</strong> demander la suppression de vos données</li>
            <li><strong>Droit à la limitation :</strong> limiter le traitement de vos données</li>
            <li><strong>Droit à la portabilité :</strong> recevoir vos données dans un format structuré</li>
            <li><strong>Droit d&apos;opposition :</strong> vous opposer au traitement de vos données</li>
            <li><strong>Droit de retrait du consentement :</strong> retirer votre consentement à tout moment</li>
          </ul>
          <p>
            Pour exercer ces droits, contactez-nous à : {CONTACT.email}
          </p>

          <h2>8. Cookies</h2>
          <p>
            Notre site utilise des cookies pour améliorer votre expérience.
            Vous pouvez gérer vos préférences de cookies à tout moment.
          </p>
          <p>Types de cookies utilisés :</p>
          <ul>
            <li><strong>Cookies essentiels :</strong> nécessaires au fonctionnement du site</li>
            <li><strong>Cookies analytiques :</strong> pour comprendre l&apos;utilisation du site</li>
            <li><strong>Cookies fonctionnels :</strong> pour mémoriser vos préférences</li>
          </ul>

          <h2>9. Sécurité</h2>
          <p>
            Nous mettons en œuvre des mesures de sécurité appropriées pour protéger
            vos données contre tout accès non autorisé, modification, divulgation
            ou destruction :
          </p>
          <ul>
            <li>Chiffrement SSL/TLS pour les transmissions de données</li>
            <li>Paiements sécurisés</li>
            <li>Accès restreint aux données personnelles</li>
            <li>Sauvegardes régulières</li>
          </ul>

          <h2>10. Modification de la politique</h2>
          <p>
            Cette politique de confidentialité peut être modifiée à tout moment.
            Nous vous informerons de tout changement significatif.
          </p>

          <p className="legal-updated">
            Dernière mise à jour : Janvier 2024
          </p>
        </div>
      </div>
      </section>
    </>
  );
}

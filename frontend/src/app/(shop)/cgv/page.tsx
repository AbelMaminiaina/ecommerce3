import { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shop/PageHeader';
import { CONTACT, CONTACT_ADDRESS_INLINE } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Conditions Générales de Vente',
  description: 'Conditions générales de vente de Tsena Pro',
};

export default function CGVPage() {
  return (
    <>
      <PageHeader title="Conditions Générales de Vente" crumbs={[{ label: "Conditions Générales de Vente" }]} />
      <section className="sw-section">
        <div className="container">
          <div className="sw-legal-doc sw-richtext">
          <p className="lead">
            Les présentes conditions générales de vente régissent les relations entre
            Tsena Pro et ses clients. Toute commande implique l&apos;acceptation
            sans réserve de ces conditions.
          </p>

          <h2>Article 1 - Objet</h2>
          <p>
            Les présentes conditions générales de vente s&apos;appliquent à toutes les
            ventes de produits effectuées par Tsena Pro, que ce soit via
            le site internet, par téléphone ou à la ferme.
          </p>

          <h2>Article 2 - Produits</h2>
          <p>
            Les produits proposés à la vente sont décrits sur le site avec la plus
            grande exactitude possible. Les photographies sont non contractuelles.
          </p>
          <p>
            <strong>Catégories de produits :</strong>
          </p>
          <ul>
            <li>Œufs frais bio et plein air</li>
            <li>Œufs fécondés de différentes races</li>
            <li>Poules vivantes</li>
            <li>Accessoires pour basse-cour</li>
          </ul>

          <h2>Article 3 - Prix</h2>
          <p>
            Les prix sont indiqués en Ariary (Ar).
            Tsena Pro est une plateforme de vente en gros entre professionnels.
          </p>
          <p>
            Les prix sont susceptibles de modification à tout moment. Les produits
            seront facturés au prix en vigueur au moment de la validation de la commande.
          </p>

          <h2>Article 4 - Commande</h2>
          <h3>4.1 Passation de commande</h3>
          <p>
            La commande peut être passée via le site internet, par téléphone ou
            directement à la ferme. La validation de la commande implique
            l&apos;acceptation des présentes CGV.
          </p>

          <h3>4.2 Confirmation de commande</h3>
          <p>
            Un email ou SMS de confirmation vous sera envoyé après validation de votre
            commande et réception du paiement.
          </p>

          <h3>4.3 Réservation de poules vivantes</h3>
          <p>
            La réservation de poules vivantes nécessite un acompte de 30%.
            Le solde est à régler lors du retrait ou de la livraison.
          </p>

          <h2 id="livraison">Article 5 - Livraison</h2>
          <h3>5.1 Zones de livraison</h3>
          <p>
            Nous livrons principalement dans la région d&apos;Antananarivo et ses environs,
            ainsi qu&apos;à Ambatolampy et les zones voisines.
          </p>

          <h3>5.2 Délais de livraison</h3>
          <ul>
            <li><strong>Livraison standard :</strong> 2 à 4 jours ouvrés</li>
            <li><strong>Livraison express :</strong> 24 à 48 heures</li>
            <li><strong>Retrait à la ferme :</strong> disponible sous 24h après confirmation</li>
          </ul>

          <h3>5.3 Frais de livraison</h3>
          <ul>
            <li><strong>Gratuit :</strong> pour les commandes supérieures à 200 000 Ar</li>
            <li><strong>Livraison standard :</strong> 15 000 Ar</li>
            <li><strong>Livraison express :</strong> 25 000 Ar</li>
            <li><strong>Retrait à la ferme :</strong> gratuit</li>
          </ul>

          <h3>5.4 Livraison de poules vivantes</h3>
          <p>
            La livraison de poules vivantes est possible dans un rayon de 50 km
            autour de la ferme à Ambatolampy. Frais de livraison : 50 000 Ar. Au-delà, le retrait à
            la ferme est privilégié pour le bien-être des animaux.
          </p>

          <h2>Article 6 - Paiement</h2>
          <p>Le paiement peut s&apos;effectuer par :</p>
          <ul>
            <li>Mobile Money (MVola, Orange Money, Airtel Money)</li>
            <li>Virement bancaire</li>
            <li>Espèces (retrait à la ferme uniquement)</li>
          </ul>
          <p>
            La commande n&apos;est traitée qu&apos;après réception du paiement intégral.
          </p>

          <h2>Article 7 - Droit de rétractation</h2>
          <h3>7.1 Produits alimentaires</h3>
          <p>
            Le droit de rétractation ne s&apos;applique pas aux denrées alimentaires
            périssables (œufs frais).
          </p>

          <h3>7.2 Animaux vivants</h3>
          <p>
            Le droit de rétractation ne s&apos;applique pas aux animaux vivants.
          </p>

          <h3>7.3 Autres produits</h3>
          <p>
            Pour les accessoires et équipements, vous disposez d&apos;un délai de
            14 jours pour exercer votre droit de rétractation, à compter de la
            réception de votre commande. Les produits doivent être retournés
            dans leur état d&apos;origine, non utilisés et dans leur emballage d&apos;origine.
          </p>

          <h2>Article 8 - Garanties et réclamations</h2>
          <h3>8.1 Œufs fécondés</h3>
          <p>
            Nous garantissons un taux de fécondité supérieur à 85% pour nos œufs
            fécondés. Si moins de 70% de vos œufs éclosent malgré une incubation
            correcte, nous vous proposons un avoir ou un remplacement.
          </p>
          <p>
            <strong>Conditions :</strong> Photos de l&apos;installation d&apos;incubation et
            des œufs non éclos requises. Réclamation à effectuer dans les 48h
            suivant la date d&apos;éclosion prévue.
          </p>

          <h3>8.2 Poules vivantes</h3>
          <p>
            Les poules sont livrées en bonne santé. En cas de problème constaté
            à la livraison, signalez-le immédiatement au livreur et contactez-nous
            dans les 24h avec photos à l&apos;appui.
          </p>

          <h3>8.3 Accessoires</h3>
          <p>
            Les accessoires bénéficient d&apos;une garantie de conformité de 6 mois.
          </p>

          <h2>Article 9 - Responsabilité</h2>
          <p>
            La responsabilité de Tsena Pro ne saurait être engagée pour :
          </p>
          <ul>
            <li>Les dommages résultant d&apos;une mauvaise utilisation des produits</li>
            <li>Les dommages résultant d&apos;un mauvais entretien des animaux</li>
            <li>Les retards de livraison dus à des circonstances exceptionnelles</li>
          </ul>

          <h2>Article 10 - Protection des données</h2>
          <p>
            Vos données personnelles sont traitées conformément à notre{' '}
            <Link href="/politique-confidentialite">Politique de confidentialité</Link>.
          </p>

          <h2>Article 11 - Litiges</h2>
          <p>
            Les présentes CGV sont soumises au droit malgache. En cas de litige,
            nous privilégions une solution amiable. À défaut, les tribunaux
            malgaches seront seuls compétents.
          </p>

          <h2>Article 12 - Contact</h2>
          <p>
            Pour toute question relative à ces CGV :<br />
            <strong>Tsena Pro</strong><br />
            {CONTACT_ADDRESS_INLINE}<br />
            Email : {CONTACT.email}<br />
            Téléphone : {CONTACT.phones.map((p) => p.display).join(' / ')}
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

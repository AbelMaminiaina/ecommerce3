import { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shop/PageHeader';
import { CONTACT, CONTACT_ADDRESS_INLINE } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Mentions Légales',
  description: 'Mentions légales de Tsena Pro',
};

export default function MentionsLegalesPage() {
  return (
    <>
      <PageHeader title="Mentions Légales" crumbs={[{ label: "Mentions Légales" }]} />
      <section className="sw-section">
        <div className="container">
          <div className="sw-legal-doc sw-richtext">
          <h2>1. Éditeur du site</h2>
          <p>
            Le site tsenapro.mg est édité par :<br />
            <strong>Tsena Pro</strong><br />
            Forme juridique : SARL<br />
            Capital social : 10 000 000 Ar<br />
            NIF : 1234567890<br />
            STAT : 12345 67 890 1 23456<br />
            Siège social : {CONTACT_ADDRESS_INLINE}<br />
            Téléphone : {CONTACT.phones.map((p) => p.display).join(' / ')}<br />
            Email : {CONTACT.email}
          </p>
          <p>
            Directeur de la publication : Varombo Fitoky
          </p>

          <h2>2. Hébergement</h2>
          <p>
            Le site est hébergé par :<br />
            <strong>Vercel Inc.</strong><br />
            340 S Lemon Ave #4133<br />
            Walnut, CA 91789<br />
            États-Unis
          </p>

          <h2>3. Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble des éléments composant ce site (textes, images, logos, graphismes,
            icônes, sons, logiciels, etc.) est la propriété exclusive de Tsena Pro,
            à l&apos;exception des marques, logos ou contenus appartenant à d&apos;autres sociétés
            partenaires ou auteurs.
          </p>
          <p>
            Toute reproduction, représentation, modification, publication, adaptation de tout
            ou partie des éléments du site, quel que soit le moyen ou le procédé utilisé,
            est interdite, sauf autorisation écrite préalable de Tsena Pro.
          </p>

          <h2>4. Données personnelles</h2>
          <p>
            Conformément à la loi malgache sur la protection des données personnelles, vous
            disposez d&apos;un droit d&apos;accès, de rectification et de suppression
            de vos données personnelles.
          </p>
          <p>
            Pour exercer ces droits, vous pouvez nous contacter :<br />
            - Par email : {CONTACT.email}<br />
            - Par courrier : {CONTACT_ADDRESS_INLINE}
          </p>
          <p>
            Pour plus d&apos;informations, consultez notre{' '}
            <Link href="/politique-confidentialite">Politique de confidentialité</Link>.
          </p>

          <h2>5. Cookies</h2>
          <p>
            Ce site utilise des cookies pour améliorer l&apos;expérience utilisateur et
            analyser le trafic. En continuant à naviguer sur ce site, vous acceptez
            l&apos;utilisation des cookies.
          </p>

          <h2>6. Limitation de responsabilité</h2>
          <p>
            Tsena Pro s&apos;efforce d&apos;assurer l&apos;exactitude et la mise à jour des
            informations diffusées sur ce site. Toutefois, elle ne peut garantir
            l&apos;exactitude, la précision ou l&apos;exhaustivité des informations mises à
            disposition sur ce site.
          </p>
          <p>
            En conséquence, l&apos;utilisateur reconnaît utiliser ces informations sous sa
            responsabilité exclusive.
          </p>

          <h2>7. Liens hypertextes</h2>
          <p>
            Ce site peut contenir des liens vers d&apos;autres sites. Tsena Pro
            n&apos;exerce aucun contrôle sur ces sites et décline toute responsabilité quant
            à leur contenu.
          </p>

          <h2>8. Droit applicable</h2>
          <p>
            Les présentes mentions légales sont soumises au droit malgache. En cas de
            litige, les tribunaux malgaches seront seuls compétents.
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

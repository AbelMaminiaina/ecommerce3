import Link from 'next/link';
import { PageHeader } from '@/components/shop/PageHeader';

// Page 404 au style ShopWise.
export default function NotFound() {
  return (
    <>
      <PageHeader title="404" crumbs={[{ label: 'Page introuvable' }]} />
      <section className="sw-section">
        <div className="container">
          <div className="sw-error">
            <span className="error-code">404</span>
            <h1>Page introuvable</h1>
            <p>
              Désolé, la page que vous cherchez n&apos;existe pas sur notre site. Retournez à l&apos;accueil ou
              parcourez le catalogue.
            </p>
            <div className="error-actions">
              <Link className="sw-btn-primary" href="/">
                <i className="bi bi-house"></i>Retour à l&apos;accueil
              </Link>
              <Link className="sw-btn-ghost" href="/produits">
                <i className="bi bi-grid"></i>Voir les produits
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

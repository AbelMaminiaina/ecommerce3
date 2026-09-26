'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product, ProductReviews as ProductReviewsData } from '@/types';
import { PageHeader } from '@/components/shop/PageHeader';
import { StarRating } from '@/components/shop/StarRating';
import { ProductCard } from '@/components/shop/ProductCard';
import { ReviewForm, useProductReviews } from '@/components/shop/ProductReviews';
import {
  formatDate,
  formatPrice,
  formatQuantity,
  formatWeight,
  getBadgeLabel,
  getCategoryLabel,
  getProductImage,
  isUpcoming,
  resolveUnitPrice,
} from '@/lib/utils';
import { useCart } from '@/hooks/useCart';
import { useCompanyAccess } from '@/hooks/useCompanyAccess';
import { useWishlist } from '@/hooks/useWishlist';
import { useToast } from '@/components/shop/Toast';

interface ProductDetailClientProps {
  product: Product;
  relatedProducts: Product[];
}

type Tab = 'description' | 'fiche' | 'avis';

const formatRating = (n: number) => String(n).replace('.', ',');

// Répartition des notes (5 → 1 étoile) à partir des avis chargés
function ratingDistribution(data: ProductReviewsData) {
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = data.reviews.filter((r) => Math.round(r.rating) === stars).length;
    return { stars, count, percent: data.reviews.length ? (count / data.reviews.length) * 100 : 0 };
  });
}

// Page produit du template ShopWise (product-details.html) : galerie avec miniatures, carte d'achat,
// onglets Description / Fiche technique / Avis, puis produits similaires.
// Les règles B2B (quantité minimum, paliers dégressifs, réservation, vendeur) sont conservées.
export default function ProductDetailClient({ product, relatedProducts }: ProductDetailClientProps) {
  const { isApproved, canOrder } = useCompanyAccess();
  // MOQ pour tous (vente en gros). Paliers dégressifs : pros approuvés uniquement.
  const minQty = product.moq;
  const [customQty, setQuantity] = useState<number | null>(null);
  const quantity = Math.max(minQty, customQty ?? minQty);
  const [tab, setTab] = useState<Tab>('description');
  const [imageIndex, setImageIndex] = useState(0);
  const [shareUrl, setShareUrl] = useState('');
  const cart = useCart();
  const wishlist = useWishlist();
  const { addToast } = useToast();
  const { data: reviews, loadFailed, reload } = useProductReviews(product.slug);

  useEffect(() => {
    setShareUrl(window.location.href.split('#')[0]);
    // Lien « Voir les avis » des cartes produit (…#avis) : ouvre directement l'onglet Avis
    if (window.location.hash === '#avis') setTab('avis');
  }, []);

  const upcoming = isUpcoming(product.availableFrom);
  const wished = wishlist.has(product.id);
  const unitPrice = isApproved ? resolveUnitPrice(product.price, product.priceTiers, quantity) : product.price;
  // Note : celle des avis chargés, sinon celle envoyée par le serveur
  const rating = reviews ? reviews.average : product.rating ?? null;
  const reviewCount = reviews ? reviews.count : product.reviewCount ?? 0;
  const discount =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round((1 - product.price / product.originalPrice) * 100)
      : 0;

  // Galerie : les photos du produit, sinon un visuel par défaut
  const gallery = product.images.length > 0 ? product.images : [getProductImage(product)];
  const currentImage = gallery[Math.min(imageIndex, gallery.length - 1)];
  const showImage = (index: number) => setImageIndex((index + gallery.length) % gallery.length);

  const categoryHref = `/produits?categorie=${product.category}`;
  const sortedTiers = product.priceTiers.slice().sort((a, b) => a.minQty - b.minQty);

  const handleAddToCart = (silent = false) => {
    cart.addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      image: getProductImage(product),
      slug: product.slug,
      metadata: product.metadata,
      freeShipping: product.freeShipping,
      estimatedWeightKg: product.estimatedWeightKg,
      availableFrom: product.availableFrom,
      moq: product.moq,
      unit: product.unit,
      priceTiers: product.priceTiers,
      sellerId: product.seller?.id ?? null,
      sellerName: product.seller?.name ?? null,
    });
    if (!silent) addToast('success', upcoming ? `${product.name} réservé` : `${product.name} ajouté au panier`);
  };

  const handleToggleWishlist = () => {
    wishlist.toggle(product.id);
    addToast('success', wished ? `${product.name} retiré des favoris` : `${product.name} ajouté aux favoris`);
  };

  const stock = upcoming
    ? { className: 'soon', label: 'Réservable' }
    : product.inStock
      ? { className: '', label: 'En stock' }
      : { className: 'out', label: 'Rupture de stock' };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'description', label: 'Description' },
    { id: 'fiche', label: 'Fiche technique' },
    { id: 'avis', label: `Avis (${reviewCount})` },
  ];

  return (
    <>
      <PageHeader
        title={product.name}
        crumbs={[
          { label: 'Produits', href: '/produits' },
          { label: getCategoryLabel(product.category), href: categoryHref },
          { label: product.name },
        ]}
      />

      <section className="sw-section sw-pd">
        <div className="container">
          <div className="row g-4">
            {/* Galerie */}
            <div className="col-lg-7">
              <div className="image-showcase">
                <div className="main-image-container">
                  {(discount > 0 || product.badges.length > 0) && (
                    <div className="sw-product-badges">
                      {discount > 0 && <span className="discount-badge">-{discount}%</span>}
                      {product.badges.map((badge) => (
                        <span key={badge} className={`sw-badge ${badge}`}>{getBadgeLabel(badge)}</span>
                      ))}
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentImage} alt={`${product.name} - photo ${imageIndex + 1}`} />
                  {gallery.length > 1 && (
                    <>
                      <button type="button" className="image-nav-btn prev-image" aria-label="Photo précédente" onClick={() => showImage(imageIndex - 1)}>
                        <i className="bi bi-chevron-left"></i>
                      </button>
                      <button type="button" className="image-nav-btn next-image" aria-label="Photo suivante" onClick={() => showImage(imageIndex + 1)}>
                        <i className="bi bi-chevron-right"></i>
                      </button>
                    </>
                  )}
                </div>
                {gallery.length > 1 && (
                  <div className="thumb-strip">
                    {gallery.map((src, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`thumb-cell${index === imageIndex ? ' active' : ''}`}
                        aria-label={`Afficher la photo ${index + 1}`}
                        aria-current={index === imageIndex}
                        onClick={() => showImage(index)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Carte d'achat */}
            <div className="col-lg-5">
              <div className="product-detail-card">
                <div className="detail-header">
                  <Link href={categoryHref} className="type-badge">{getCategoryLabel(product.category)}</Link>
                  <span className={`stock-indicator ${stock.className}`}>
                    <i className="bi bi-circle-fill"></i> {stock.label}
                  </span>
                </div>

                <h1 className="product-heading">{product.name}</h1>

                <div className="review-summary">
                  <StarRating value={rating} count={reviewCount} showCount={false} />
                  {reviewCount > 0 && rating !== null && <span className="score-text">{formatRating(rating)}</span>}
                  <span className="divider-dot">·</span>
                  <a href="#avis" className="reviews-anchor" onClick={() => setTab('avis')}>
                    {reviewCount > 0 ? `${reviewCount} avis` : 'Aucun avis'}
                  </a>
                  {!upcoming && product.inStock && product.stockQuantity ? (
                    <>
                      <span className="divider-dot">·</span>
                      <span className="units-left">{product.stockQuantity} en stock</span>
                    </>
                  ) : null}
                </div>

                {product.seller && (
                  <p className="seller-line">
                    <i className="bi bi-shop"></i>Vendu par{' '}
                    <Link href={`/vendeurs/${product.seller.id}`} className="fw-semibold">{product.seller.name}</Link>
                    {' · '}
                    <Link href={`/vendeurs/${product.seller.id}`}>Voir la boutique</Link>
                  </p>
                )}

                <div className="pricing-area">
                  <div className="price-row">
                    <span className="price-now">{formatPrice(unitPrice)}</span>
                    <span className="price-unit">/{product.unit}</span>
                    {product.originalPrice && <span className="price-was">{formatPrice(product.originalPrice)}</span>}
                  </div>
                  {discount > 0 && (
                    <span className="save-tag">Économisez {formatPrice(product.originalPrice! - product.price)}</span>
                  )}
                </div>

                {product.shortDescription && <p className="summary-text">{product.shortDescription}</p>}
                <div className="separator"></div>

                <ul className="facts">
                  <li>
                    <i className="bi bi-box"></i>
                    <span>Quantité minimum : <strong>{formatQuantity(product.moq, product.unit)}</strong></span>
                  </li>
                  <li>
                    <i className="bi bi-calendar-check"></i>
                    <span>
                      Disponibilité :{' '}
                      {upcoming ? (
                        <strong className="warn">
                          à partir du {formatDate(product.availableFrom!)} — réservation possible dès maintenant
                        </strong>
                      ) : product.inStock ? (
                        <strong className="ok">{product.stockQuantity ? `${product.stockQuantity} en stock` : 'En stock'}</strong>
                      ) : (
                        <strong className="ko">Rupture de stock</strong>
                      )}
                    </span>
                  </li>
                  {product.estimatedWeightKg ? (
                    <li>
                      <i className="bi bi-speedometer2"></i>
                      <span>Poids estimé : <strong>{formatWeight(product.estimatedWeightKg)}</strong></span>
                    </li>
                  ) : null}
                  <li>
                    <i className="bi bi-truck"></i>
                    <span>
                      Livraison gratuite :{' '}
                      <strong>{product.freeShipping ? 'Incluse pour ce produit' : 'Dès 200 000 Ar d’achat'}</strong>
                    </span>
                  </li>
                </ul>

                {isApproved && sortedTiers.length > 0 ? (
                  <div className="tiers-box">
                    <h6>Tarifs par quantité</h6>
                    <table>
                      <tbody>
                        <tr>
                          <td>À partir de {formatQuantity(product.moq, product.unit)}</td>
                          <td>{formatPrice(product.price)}</td>
                        </tr>
                        {sortedTiers.map((tier) => (
                          <tr key={tier.minQty}>
                            <td>À partir de {formatQuantity(tier.minQty, product.unit)}</td>
                            <td>{formatPrice(tier.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  sortedTiers.length > 0 && (
                    <p className="pro-hint">
                      Tarifs dégressifs réservés aux comptes professionnels.{' '}
                      <Link href="/inscription?type=professionnel" className="fw-semibold">Créer un compte professionnel</Link>
                    </p>
                  )
                )}

                {canOrder && (product.inStock || upcoming) && (
                  <>
                    <div className="action-row">
                      <div className="sw-quantity">
                        <button
                          type="button"
                          onClick={() => setQuantity(Math.max(minQty, quantity - 1))}
                          aria-label="Diminuer la quantité"
                        >
                          <i className="bi bi-dash"></i>
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={quantity}
                          aria-label="Quantité"
                          onChange={(e) => {
                            const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                            setQuantity(Number.isFinite(n) ? n : minQty);
                          }}
                          onBlur={() => setQuantity(Math.max(minQty, quantity))}
                        />
                        <button type="button" onClick={() => setQuantity(quantity + 1)} aria-label="Augmenter la quantité">
                          <i className="bi bi-plus"></i>
                        </button>
                      </div>
                      <button type="button" className="primary-action-btn" onClick={() => handleAddToCart()}>
                        <i className={`bi ${upcoming ? 'bi-calendar-plus' : 'bi-bag-plus'}`}></i>
                        {upcoming ? 'Réserver' : 'Ajouter au panier'}
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleWishlist}
                        aria-pressed={wished}
                        aria-label={wished ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        className={`wishlist-toggle${wished ? ' active' : ''}`}
                      >
                        <i className={`bi ${wished ? 'bi-heart-fill' : 'bi-heart'}`}></i>
                      </button>
                    </div>
                    <Link href="/checkout" className="checkout-now-btn" onClick={() => handleAddToCart(true)}>
                      <i className="bi bi-lightning-charge"></i> Commander maintenant
                    </Link>
                  </>
                )}

                <div className="guarantee-bar">
                  <div className="guarantee-item"><i className="bi bi-truck"></i><span>Livraison à Antananarivo</span></div>
                  <div className="guarantee-item"><i className="bi bi-phone"></i><span>Paiement Mobile Money</span></div>
                  <div className="guarantee-item"><i className="bi bi-shield-check"></i><span>Vendeurs vérifiés</span></div>
                  <div className="guarantee-item"><i className="bi bi-headset"></i><span>Support à l&apos;écoute</span></div>
                </div>

                <div className="share-row">
                  <span>Partager :</span>
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Partager sur Facebook"
                  >
                    <i className="bi bi-facebook"></i>
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(product.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Partager sur X"
                  >
                    <i className="bi bi-twitter-x"></i>
                  </a>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${product.name} ${shareUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Partager sur WhatsApp"
                  >
                    <i className="bi bi-whatsapp"></i>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Onglets */}
          <div className="row mt-5">
            <div className="col-12">
              <div className="info-tabs">
                <ul className="tab-nav" role="tablist">
                  {tabs.map((t) => (
                    <li key={t.id} role="presentation">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        className={`nav-link${tab === t.id ? ' active' : ''}`}
                        onClick={() => setTab(t.id)}
                      >
                        {t.label}
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="tab-content">
                  {/* Description */}
                  <div className={`tab-pane${tab === 'description' ? ' active' : ''}`} role="tabpanel">
                    <div className="desc-content">
                      <div className="row g-4">
                        <div className="col-lg-8">
                          <h3>À propos de ce produit</h3>
                          <p className="lead-text">{product.description}</p>
                          {product.characteristics && product.characteristics.length > 0 && (
                            <>
                              <h4>Caractéristiques</h4>
                              <div className="row g-3">
                                {product.characteristics.map((item, index) => (
                                  <div key={index} className="col-sm-6">
                                    <div className="highlight-card">
                                      <i className="bi bi-check2-circle"></i>
                                      <p>{item}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="col-lg-4">
                          <div className="included-box">
                            <h4><i className="bi bi-clipboard-check"></i> Conditions de vente</h4>
                            <ul>
                              <li><i className="bi bi-check2-circle"></i> Vente en gros : minimum {formatQuantity(product.moq, product.unit)}</li>
                              <li><i className="bi bi-check2-circle"></i> Pour les particuliers comme pour les entreprises</li>
                              <li><i className="bi bi-check2-circle"></i> Paiement en ligne par MVola, Orange Money ou Airtel Money</li>
                              <li><i className="bi bi-check2-circle"></i> Commande traitée dès que le paiement est vérifié</li>
                              {sortedTiers.length > 0 && (
                                <li><i className="bi bi-check2-circle"></i> Tarifs dégressifs pour les comptes professionnels</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Fiche technique */}
                  <div className={`tab-pane${tab === 'fiche' ? ' active' : ''}`} role="tabpanel">
                    <div className="row g-4">
                      <div className="col-md-6">
                        <div className="spec-block">
                          <h4>Produit</h4>
                          <table className="data-table">
                            <tbody>
                              <tr>
                                <th scope="row">Catégorie</th>
                                <td>{getCategoryLabel(product.category)}</td>
                              </tr>
                              <tr>
                                <th scope="row">Unité de vente</th>
                                <td>{product.unit}</td>
                              </tr>
                              <tr>
                                <th scope="row">Poids estimé</th>
                                <td>
                                  {product.estimatedWeightKg ? (
                                    <>
                                      {formatWeight(product.estimatedWeightKg)} par {product.unit}{' '}
                                      <span className="text-muted">(indicatif, n’entre pas dans le prix)</span>
                                    </>
                                  ) : (
                                    'Non renseigné'
                                  )}
                                </td>
                              </tr>
                              {product.seller && (
                                <tr>
                                  <th scope="row">Vendeur</th>
                                  <td>
                                    <Link href={`/vendeurs/${product.seller.id}`}>{product.seller.name}</Link>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="spec-block">
                          <h4>Commande &amp; livraison</h4>
                          <table className="data-table">
                            <tbody>
                              <tr>
                                <th scope="row">Quantité minimum</th>
                                <td>{formatQuantity(product.moq, product.unit)}</td>
                              </tr>
                              <tr>
                                <th scope="row">Prix de base</th>
                                <td>{formatPrice(product.price)} / {product.unit}</td>
                              </tr>
                              <tr>
                                <th scope="row">Tarifs dégressifs</th>
                                <td>{sortedTiers.length > 0 ? `${sortedTiers.length} palier(s), comptes pros` : 'Non'}</td>
                              </tr>
                              <tr>
                                <th scope="row">Livraison</th>
                                <td>{product.freeShipping ? 'Offerte pour ce produit' : 'Gratuite dès 200 000 Ar d’achat'}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Avis */}
                  <div className={`tab-pane${tab === 'avis' ? ' active' : ''}`} role="tabpanel">
                    {reviews && reviews.count > 0 ? (
                      <>
                        <div className="row g-4 mb-4">
                          <div className="col-lg-3 col-md-4">
                            <div className="rating-overview">
                              <div className="big-number">{formatRating(reviews.average ?? 0)}</div>
                              <StarRating value={reviews.average} count={reviews.count} showCount={false} />
                              <span className="count-label">Sur la base de {reviews.count} avis</span>
                              <a href="#avis" className="review-cta">Donner mon avis</a>
                            </div>
                          </div>
                          <div className="col-lg-9 col-md-8">
                            <div className="distribution-chart">
                              {ratingDistribution(reviews).map((row) => (
                                <div key={row.stars} className="dist-row">
                                  <span className="dist-label">{row.stars} <i className="bi bi-star-fill"></i></span>
                                  <div className="dist-track">
                                    <div className="dist-fill" style={{ '--pct': `${row.percent}%` } as React.CSSProperties}></div>
                                  </div>
                                  <span className="dist-count">{row.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="reviews-list">
                          {reviews.reviews.map((review) => (
                            <article key={review.id} className="review-entry">
                              <div className="entry-top">
                                <span className="avatar-initial" aria-hidden="true">{review.author.charAt(0).toUpperCase()}</span>
                                <div className="entry-meta">
                                  <strong>{review.author}</strong>
                                  <div className="meta-line">
                                    <StarRating value={review.rating} count={1} showCount={false} />
                                    <span className="entry-date">{formatDate(review.createdAt)}</span>
                                  </div>
                                </div>
                              </div>
                              {review.comment && <p>{review.comment}</p>}
                            </article>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mb-0">
                        {loadFailed
                          ? 'Les avis sont momentanément indisponibles.'
                          : "Ce produit n'a pas encore d'avis. Soyez le premier à donner le vôtre !"}
                      </p>
                    )}
                    <div className="review-form-box">
                      <ReviewForm slug={product.slug} onSaved={reload} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {relatedProducts.length > 0 && (
        <section className="sw-section sw-light">
          <div className="container sw-section-title">
            <h2>Produits similaires</h2>
            <p>D&apos;autres produits qui pourraient vous intéresser</p>
          </div>
          <div className="container">
            <div className="row g-4">
              {relatedProducts.slice(0, 4).map((related) => (
                <div key={related.id} className="col-lg-3 col-md-6">
                  <ProductCard product={related} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

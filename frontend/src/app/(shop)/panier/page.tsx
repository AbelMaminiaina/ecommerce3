'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/hooks/useCart';
import { useCompanyAccess } from '@/hooks/useCompanyAccess';
import {
  formatDate,
  formatPrice,
  formatQuantity,
  formatWeight,
  getShippingCost,
  groupBySeller,
  isUpcoming,
  resolveUnitPrice,
  FREE_SHIPPING_THRESHOLD,
} from '@/lib/utils';
import { PageHeader } from '@/components/shop/PageHeader';

type Item = ReturnType<typeof useCart>['items'][number];

// Page panier du template ShopWise (cart.html) : tableau des articles à gauche, carte
// « Récapitulatif » collante à droite. Règles B2B : quantité minimum, paliers pro, une commande par vendeur.
export default function CartPage() {
  const cart = useCart();
  const { isApproved } = useCompanyAccess();

  // MOQ pour tous ; paliers dégressifs réservés aux comptes pro approuvés (les autres paient le
  // prix de base). Le prix facturé est recalculé côté backend à la commande.
  const unitPrice = (item: Item) =>
    isApproved ? resolveUnitPrice(item.price, item.priceTiers, item.quantity) : item.price;

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.items.reduce((sum, item) => sum + unitPrice(item) * item.quantity, 0);
  // Une commande (et des frais de livraison) par vendeur
  const sellerGroups = groupBySeller(cart.items);
  const hasFreeShippingItem = sellerGroups.every((group) => group.items.some((item) => item.freeShipping));
  const shippingCost = sellerGroups.reduce(
    (sum, group) =>
      sum +
      getShippingCost(
        'standard',
        group.items.reduce((acc, item) => acc + unitPrice(item) * item.quantity, 0),
        group.items.some((item) => item.freeShipping)
      ),
    0
  );
  const total = subtotal + shippingCost;

  const handleClear = () => {
    if (window.confirm('Vider entièrement votre panier ?')) cart.clearCart();
  };

  if (cart.items.length === 0) {
    return (
      <>
        <PageHeader title="Mon panier" crumbs={[{ label: 'Panier' }]} />
        <section className="sw-section">
          <div className="container">
            <div className="sw-empty">
              <i className="bi bi-bag-x"></i>
              <h2>Votre panier est vide</h2>
              <p>Découvrez nos produits et commencez vos achats !</p>
              <Link href="/produits" className="sw-btn-primary">
                Voir nos produits <i className="bi bi-arrow-right"></i>
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mon panier" crumbs={[{ label: 'Panier' }]} />

      <section className="sw-section sw-cart">
        <div className="container">
          <div className="row gy-5">
            <div className="col-lg-8">
              <div className="cart-table">
                <div className="table-head d-none d-md-flex row align-items-center">
                  <div className="col-md-5">Produit</div>
                  <div className="col-md-2 text-center">Prix</div>
                  <div className="col-md-3 text-center">Quantité</div>
                  <div className="col-md-2 text-end">Total</div>
                </div>

                {cart.items.map((item) => {
                  const belowMoq = item.quantity < item.moq;
                  return (
                    <div key={item.productId} className="cart-item">
                      <div className="row align-items-center g-3">
                        <div className="col-md-5">
                          <div className="d-flex align-items-center gap-3">
                            <Link href={`/produits/${item.slug}`} className="product-img">
                              <Image src={item.image} alt={item.name} width={72} height={72} />
                            </Link>
                            <div>
                              <h6 className="product-title">
                                <Link href={`/produits/${item.slug}`}>{item.name}</Link>
                              </h6>
                              <div className="product-tags">
                                {item.sellerName && (
                                  <span className="tag-item">
                                    Vendu par{' '}
                                    {item.sellerId ? <Link href={`/vendeurs/${item.sellerId}`}>{item.sellerName}</Link> : item.sellerName}
                                  </span>
                                )}
                                <span className={`tag-item${belowMoq ? ' warn' : ''}`}>
                                  Minimum&nbsp;: {formatQuantity(item.moq, item.unit)}
                                </span>
                                {item.estimatedWeightKg ? (
                                  <span className="tag-item">{formatWeight(item.estimatedWeightKg)} / {item.unit}</span>
                                ) : null}
                                {item.freeShipping && <span className="tag-item accent">Livraison offerte</span>}
                                {isUpcoming(item.availableFrom) && (
                                  <span className="tag-item warn">Réservation — disponible le {formatDate(item.availableFrom!)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-2 col-6">
                          <div className="price-col text-md-center">
                            <span className="mobile-label">Prix</span>
                            <span className="current-price">{formatPrice(unitPrice(item))}</span>
                            <span className="unit">/{item.unit}</span>
                          </div>
                        </div>
                        <div className="col-md-3 col-6">
                          <div className="d-flex flex-column align-items-end align-items-md-center">
                            <span className="mobile-label">Quantité</span>
                            <div className="sw-quantity sm">
                              <button
                                type="button"
                                onClick={() => cart.updateQuantity(item.productId, item.quantity - 1 < item.moq ? 0 : item.quantity - 1)}
                                aria-label={item.quantity - 1 < item.moq ? `Retirer ${item.name}` : 'Diminuer la quantité'}
                              >
                                <i className={`bi ${item.quantity - 1 < item.moq ? 'bi-trash3' : 'bi-dash'}`}></i>
                              </button>
                              <span className="qty-value" aria-label="Quantité">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => cart.updateQuantity(item.productId, item.quantity + 1)}
                                aria-label="Augmenter la quantité"
                              >
                                <i className="bi bi-plus"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-2 col-12">
                          <div className="text-end">
                            <span className="mobile-label">Total</span>
                            <span className="row-total">{formatPrice(unitPrice(item) * item.quantity)}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => cart.removeItem(item.productId)}
                        aria-label={`Supprimer ${item.name}`}
                      >
                        <i className="bi bi-trash3"></i>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="cart-actions d-flex justify-content-between align-items-center">
                <Link href="/produits" className="action-link">
                  <i className="bi bi-arrow-left"></i> Continuer mes achats
                </Link>
                <button type="button" className="action-clear" onClick={handleClear}>
                  <i className="bi bi-trash3"></i> Vider le panier
                </button>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="sw-summary-card">
                <div className="summary-header">
                  <h5>Récapitulatif</h5>
                  <span className="items-count">
                    {itemCount} article{itemCount > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="summary-body">
                  <div className="summary-row">
                    <span className="label-text">Sous-total</span>
                    <span className="value-text">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label-text">Livraison (standard)</span>
                    {shippingCost === 0 ? (
                      <span className="value-text free">Gratuite</span>
                    ) : (
                      <span className="value-text">{formatPrice(shippingCost)}</span>
                    )}
                  </div>
                  {sellerGroups.length > 1 && (
                    <p className="summary-note mb-0">
                      <i className="bi bi-shop"></i>
                      Votre panier sera scindé en {sellerGroups.length} commandes, une par vendeur.
                    </p>
                  )}
                  {hasFreeShippingItem ? (
                    <p className="summary-note success mb-0">
                      <i className="bi bi-gift"></i>Votre panier contient un produit à livraison offerte
                    </p>
                  ) : (
                    sellerGroups.length === 1 &&
                    subtotal < FREE_SHIPPING_THRESHOLD && (
                      <p className="summary-note mb-0">
                        <i className="bi bi-truck"></i>
                        Plus que {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} pour la livraison gratuite
                      </p>
                    )
                  )}
                  <p className="summary-note mb-0">
                    <i className="bi bi-info-circle"></i>Le mode de livraison (standard, express ou retrait) se choisit à l&apos;étape suivante.
                  </p>

                  <div className="summary-total">
                    <span>Total</span>
                    <span className="total-value">{formatPrice(total)}</span>
                  </div>

                  <Link href="/checkout" className="proceed-btn">
                    Passer la commande <i className="bi bi-arrow-right"></i>
                  </Link>

                  <div className="payment-info">
                    <span className="payment-label">Paiement accepté</span>
                    <div className="payment-names">
                      <span>MVola</span>
                      <span>Orange Money</span>
                      <span>Airtel Money</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCart } from '@/hooks/useCart';
import { useCompanyAccess } from '@/hooks/useCompanyAccess';
import { formatDeliveryWindow, formatPrice, formatQuantity, getShippingCost, groupBySeller, isUpcoming, resolveUnitPrice } from '@/lib/utils';
import { PageHeader } from '@/components/shop/PageHeader';
import { createOrder } from '@/lib/api/checkout';
import { getPaymentMethods, type PaymentMethodId, type PaymentMethodInfo } from '@/lib/api/payments';
import { filterCheckoutSteps, type CheckoutStepId } from './checkout-steps';

type DeliveryMethod = 'standard' | 'express' | 'retrait';

interface GuestInfo {
  name: string;
  email: string;
  phone: string;
}

interface AddressInfo {
  street: string;
  city: string;
  postalCode: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALL_STEPS: { id: CheckoutStepId; label: string }[] = [
  { id: 'contact', label: 'Coordonnées' },
  { id: 'adresse', label: 'Adresse' },
  { id: 'livraison', label: 'Livraison' },
  { id: 'confirmation', label: 'Paiement' },
];

// Page de commande du template ShopWise (checkout.html) : étapes numérotées, formulaire en sections
// (coordonnées, livraison, paiement, validation) et récapitulatif collant à droite.
// Paiement Mobile Money obligatoire ; commande possible sans compte ; une commande par vendeur.
export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const { status, isApproved, isCustomer, canOrder, session, accessToken } = useCompanyAccess();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addressInfo, setAddressInfo] = useState<AddressInfo>({ street: '', city: '', postalCode: '' });
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('standard');
  const [notes, setNotes] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Paiement Mobile Money obligatoire pour tous (visiteurs, particuliers, entreprises)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodInfo[] | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | null>(null);
  const [paymentMethodsError, setPaymentMethodsError] = useState(false);

  useEffect(() => {
    getPaymentMethods()
      .then((methods) => {
        setPaymentMethods(methods);
        setPaymentMethod((current) => current ?? methods[0]?.id ?? null);
      })
      .catch(() => setPaymentMethodsError(true));
  }, []);

  // Visiteur sans compte : il remplit ses coordonnées (pas de connexion obligatoire)
  const isGuest = status === 'unauthenticated';
  const [guestInfo, setGuestInfo] = useState<GuestInfo>({ name: '', email: '', phone: '' });
  const [website, setWebsite] = useState(''); // champ piège anti-robot : reste vide pour un humain

  const unitPrice = (item: (typeof cart.items)[number]) =>
    isApproved ? resolveUnitPrice(item.price, item.priceTiers, item.quantity) : item.price;

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.items.reduce((sum, item) => sum + unitPrice(item) * item.quantity, 0);
  // Une commande (et des frais de livraison) par vendeur
  const sellerGroups = groupBySeller(cart.items);
  const shippingFor = (method: DeliveryMethod) =>
    sellerGroups.reduce(
      (sum, group) =>
        sum +
        getShippingCost(
          method,
          group.items.reduce((acc, item) => acc + unitPrice(item) * item.quantity, 0),
          group.items.some((item) => item.freeShipping)
        ),
      0
    );
  const hasFreeShippingItem = sellerGroups.every((group) => group.items.some((item) => item.freeShipping));
  const shippingCost = shippingFor(deliveryMethod);
  const total = subtotal + shippingCost;
  const belowMoqItems = cart.items.filter((item) => item.quantity < item.moq);
  const isPickup = deliveryMethod === 'retrait';

  const steps = useMemo(() => filterCheckoutSteps(ALL_STEPS, hasFreeShippingItem, isGuest), [hasFreeShippingItem, isGuest]);

  // Validité de chaque section du formulaire
  const contactValid =
    guestInfo.name.trim().length >= 2 && EMAIL_PATTERN.test(guestInfo.email.trim()) && guestInfo.phone.trim().length >= 6;
  const addressValid = isPickup || !!(addressInfo.street.trim() && addressInfo.city.trim());
  const paymentValid = belowMoqItems.length === 0 && !!paymentMethod;
  const stepValid: Record<CheckoutStepId, boolean> = {
    contact: contactValid,
    adresse: addressValid,
    livraison: true,
    confirmation: paymentValid && acceptTerms,
  };
  const activeStep = steps.find((s) => !stepValid[s.id])?.id ?? 'confirmation';

  const missing = [
    isGuest && !contactValid && 'vos coordonnées (nom, e-mail valide, téléphone)',
    !addressValid && 'l’adresse de livraison (adresse et ville)',
    !paymentMethod && 'un moyen de paiement',
    belowMoqItems.length > 0 && 'les quantités minimum',
    !acceptTerms && 'l’acceptation des conditions générales de vente',
  ].filter(Boolean) as string[];
  const canSubmit = missing.length === 0 && (isGuest || !!accessToken);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !paymentMethod) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await createOrder(
        {
          items: cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          ...(!isPickup
            ? {
                shippingAddress: {
                  street: addressInfo.street,
                  city: addressInfo.city,
                  postalCode: addressInfo.postalCode,
                },
              }
            : {}),
          deliveryMethod,
          paymentMethod,
          notes: notes || undefined,
          ...(isGuest
            ? {
                guest: {
                  name: guestInfo.name.trim(),
                  email: guestInfo.email.trim(),
                  phone: guestInfo.phone.trim(),
                },
                website,
              }
            : {}),
        },
        isGuest ? undefined : accessToken
      );

      if (response.success && response.orderNumber) {
        cart.clearCart();
        const numbers = response.orders?.map((o) => o.orderNumber) ?? [response.orderNumber];
        router.push(
          `/checkout/confirmation?order=${numbers.join(',')}${
            isGuest ? `&guest=${encodeURIComponent(guestInfo.email.trim())}` : ''
          }`
        );
      } else {
        setError(response.message || 'Une erreur est survenue');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création de la commande. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  const crumbs = [{ label: 'Panier', href: '/panier' }, { label: 'Commande' }];

  if (status === 'loading') {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Chargement…</span>
        </div>
      </div>
    );
  }

  if (!canOrder) {
    return (
      <>
        <PageHeader title="Commande" crumbs={crumbs} />
        <section className="sw-section">
          <div className="container" style={{ maxWidth: 640 }}>
            <div className="sw-empty">
              <i className="bi bi-hourglass-split"></i>
              <h2>Compte en attente de validation</h2>
              <p>
                Votre compte professionnel doit être approuvé par notre équipe avant de pouvoir passer commande. Vous
                serez notifié par e-mail dès que ce sera fait.
              </p>
              <Link href="/" className="sw-btn-primary">Retour à l&apos;accueil</Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (cart.items.length === 0) {
    return (
      <>
        <PageHeader title="Commande" crumbs={crumbs} />
        <section className="sw-section">
          <div className="container">
            <div className="sw-empty">
              <i className="bi bi-bag-x"></i>
              <h2>Votre panier est vide</h2>
              <p>Ajoutez des produits à votre panier pour passer commande.</p>
              <Link href="/produits" className="sw-btn-primary">Voir nos produits</Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Finaliser ma commande"
        crumbs={crumbs}
        description={
          isGuest
            ? 'Commande sans compte — paiement par Mobile Money'
            : isCustomer
              ? `${session?.user?.name ?? ''} — paiement par Mobile Money`
              : `${session?.user?.companyName ?? ''} — paiement par Mobile Money`
        }
      />

      <section className="sw-section sw-checkout">
        <div className="container">
          {/* Étapes */}
          <div className="step-indicator" aria-label="Progression de la commande">
            {steps.map((step, index) => {
              const done = stepValid[step.id] && step.id !== activeStep;
              return (
                <React.Fragment key={step.id}>
                  {index > 0 && <div className="step-connector"></div>}
                  <div className={`step-pill${step.id === activeStep ? ' active' : done ? ' done' : ''}`}>
                    <span className="step-num">{done ? <i className="bi bi-check-lg"></i> : index + 1}</span>
                    <span className="step-text">{step.label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <div className="row g-4">
            {/* Formulaire */}
            <div className="col-lg-7 order-lg-1 order-2">
              <div className="checkout-card">
                <form onSubmit={handleSubmitOrder} noValidate>
                  {isGuest && (
                    <>
                      <div className="form-section">
                        <div className="section-label">
                          <span className="label-icon"><i className="bi bi-person"></i></span>
                          <div>
                            <h3>Vos coordonnées</h3>
                            <p>Commandez sans créer de compte.</p>
                          </div>
                        </div>
                        <p className="login-hint">
                          Vous avez déjà un compte ?{' '}
                          <Link href="/connexion?callbackUrl=/checkout" className="fw-semibold">Connectez-vous</Link>{' '}
                          (votre panier est conservé).
                        </p>
                        <div className="section-fields">
                          <div className="row g-3">
                            <div className="col-sm-6 field-group">
                              <label htmlFor="guest-name">Nom complet *</label>
                              <input
                                id="guest-name"
                                className="form-control"
                                autoComplete="name"
                                value={guestInfo.name}
                                onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })}
                                placeholder="Jean Rakoto"
                                maxLength={100}
                                required
                              />
                            </div>
                            <div className="col-sm-6 field-group">
                              <label htmlFor="guest-phone">Téléphone *</label>
                              <input
                                id="guest-phone"
                                type="tel"
                                className="form-control"
                                autoComplete="tel"
                                value={guestInfo.phone}
                                onChange={(e) => setGuestInfo({ ...guestInfo, phone: e.target.value })}
                                placeholder="034 00 000 00"
                                maxLength={30}
                                required
                              />
                              <div className="field-hint">Pour organiser la livraison ou le retrait.</div>
                            </div>
                            <div className="col-12 field-group">
                              <label htmlFor="guest-email">E-mail *</label>
                              <input
                                id="guest-email"
                                type="email"
                                className={`form-control${guestInfo.email && !EMAIL_PATTERN.test(guestInfo.email.trim()) ? ' is-invalid' : ''}`}
                                autoComplete="email"
                                value={guestInfo.email}
                                onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })}
                                placeholder="jean@exemple.mg"
                                maxLength={200}
                                required
                              />
                              <div className="invalid-feedback">Adresse e-mail invalide.</div>
                              <div className="field-hint">
                                La confirmation et les instructions de paiement y seront envoyées. Gardez-la : elle vous sert à suivre votre commande.
                              </div>
                            </div>
                          </div>
                          {/* Champ piège pour les robots : caché aux humains */}
                          <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
                            <label htmlFor="guest-website">Ne pas remplir</label>
                            <input
                              id="guest-website"
                              tabIndex={-1}
                              autoComplete="off"
                              value={website}
                              onChange={(e) => setWebsite(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <hr className="section-divider" />
                    </>
                  )}

                  {/* Livraison */}
                  <div className="form-section">
                    <div className="section-label">
                      <span className="label-icon"><i className="bi bi-geo-alt"></i></span>
                      <div>
                        <h3>Livraison</h3>
                        <p>Où souhaitez-vous recevoir votre commande ?</p>
                      </div>
                    </div>
                    <div className="section-fields">
                      <div className="method-tabs">
                        <label className="method-tab">
                          <input
                            type="radio"
                            name="delivery-mode"
                            checked={!isPickup}
                            onChange={() => setDeliveryMethod('standard')}
                          />
                          <span className="tab-inner"><i className="bi bi-truck"></i><span>Livraison</span></span>
                        </label>
                        <label className="method-tab">
                          <input
                            type="radio"
                            name="delivery-mode"
                            checked={isPickup}
                            onChange={() => setDeliveryMethod('retrait')}
                          />
                          <span className="tab-inner"><i className="bi bi-shop"></i><span>Retrait sur place</span></span>
                        </label>
                      </div>

                      {isPickup ? (
                        <div className="alt-method-msg">
                          <i className="bi bi-shop me-2"></i>
                          Vous récupérez votre commande sur place, sans frais de livraison. Nous vous contactons dès qu&apos;elle est prête.
                        </div>
                      ) : (
                        <>
                          <div className="row g-3">
                            <div className="col-12 field-group">
                              <label htmlFor="street">Adresse *</label>
                              <input
                                id="street"
                                className="form-control"
                                autoComplete="street-address"
                                value={addressInfo.street}
                                onChange={(e) => setAddressInfo({ ...addressInfo, street: e.target.value })}
                                placeholder="Numéro, rue, quartier"
                                required
                              />
                            </div>
                            <div className="col-sm-8 field-group">
                              <label htmlFor="city">Ville *</label>
                              <input
                                id="city"
                                className="form-control"
                                autoComplete="address-level2"
                                value={addressInfo.city}
                                onChange={(e) => setAddressInfo({ ...addressInfo, city: e.target.value })}
                                placeholder="Antananarivo"
                                required
                              />
                            </div>
                            <div className="col-sm-4 field-group">
                              <label htmlFor="postal">Code postal</label>
                              <input
                                id="postal"
                                className="form-control"
                                autoComplete="postal-code"
                                value={addressInfo.postalCode}
                                onChange={(e) => setAddressInfo({ ...addressInfo, postalCode: e.target.value })}
                                placeholder="101"
                              />
                            </div>
                          </div>

                          {steps.some((s) => s.id === 'livraison') && (
                            <>
                              <label className="d-block fw-medium text-dark mt-4 mb-2" style={{ fontSize: 14 }}>Délai de livraison</label>
                              <div className="method-tabs mb-0">
                                {(['standard', 'express'] as const).map((method) => {
                                  const cost = shippingFor(method);
                                  return (
                                    <label key={method} className="method-tab">
                                      <input
                                        type="radio"
                                        name="delivery-speed"
                                        value={method}
                                        checked={deliveryMethod === method}
                                        onChange={() => setDeliveryMethod(method)}
                                      />
                                      <span className="tab-inner">
                                        <span>{method === 'standard' ? 'Standard' : 'Express'}</span>
                                        <small>{method === 'standard' ? 'Sous 24-48h' : 'Le jour même'}</small>
                                        <span className={`tab-price${cost === 0 ? ' free' : ''}`}>
                                          {cost === 0 ? 'Gratuit' : formatPrice(cost)}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <hr className="section-divider" />

                  {/* Paiement */}
                  <div className="form-section">
                    <div className="section-label">
                      <span className="label-icon"><i className="bi bi-phone"></i></span>
                      <div>
                        <h3>Paiement par Mobile Money</h3>
                        <p>Le paiement en ligne est demandé à la commande.</p>
                      </div>
                    </div>
                    <div className="section-fields">
                      {paymentMethods === null && !paymentMethodsError && (
                        <div className="text-center py-3">
                          <div className="spinner-border spinner-border-sm text-primary" role="status">
                            <span className="visually-hidden">Chargement…</span>
                          </div>
                        </div>
                      )}
                      {paymentMethodsError && (
                        <div className="alert alert-danger" role="alert">
                          Impossible de charger les moyens de paiement. Actualisez la page.
                        </div>
                      )}
                      {paymentMethods?.length === 0 && (
                        <div className="alert alert-warning" role="alert">
                          Aucun moyen de paiement n&apos;est disponible pour le moment. Merci de réessayer plus tard.
                        </div>
                      )}
                      {paymentMethods && paymentMethods.length > 0 && (
                        <div className="method-tabs">
                          {paymentMethods.map((method) => (
                            <label key={method.id} className="method-tab">
                              <input
                                type="radio"
                                name="payment"
                                value={method.id}
                                checked={paymentMethod === method.id}
                                onChange={() => setPaymentMethod(method.id)}
                              />
                              <span className="tab-inner"><i className="bi bi-phone"></i><span>{method.label}</span></span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="alt-method-msg">
                        <i className="bi bi-info-circle me-2"></i>
                        Après validation, le numéro à créditer vous est indiqué ({formatPrice(total)} au total) et votre
                        commande est traitée dès que votre paiement est vérifié. Le paiement par carte bancaire n&apos;est
                        pas encore disponible.
                      </div>

                      {belowMoqItems.length > 0 && (
                        <div className="alert alert-danger mt-3 mb-0" role="alert">
                          <strong>Quantité minimum non atteinte</strong>
                          <ul className="mb-0 mt-1">
                            {belowMoqItems.map((item) => (
                              <li key={item.productId}>
                                {item.name} — minimum {formatQuantity(item.moq, item.unit)}, actuellement {item.quantity}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="field-group mt-4">
                        <label htmlFor="notes">Notes de commande (optionnel)</label>
                        <textarea
                          id="notes"
                          className="form-control"
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Instructions spéciales pour la livraison..."
                        />
                      </div>
                    </div>
                  </div>

                  <hr className="section-divider" />

                  {/* Validation */}
                  <div className="form-section">
                    <div className="form-check agree-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="accept-terms"
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="accept-terms">
                        J&apos;accepte les{' '}
                        <Link href="/cgv" target="_blank">conditions générales de vente</Link> et la{' '}
                        <Link href="/politique-confidentialite" target="_blank">politique de confidentialité</Link>
                      </label>
                    </div>

                    {error && <div className="alert alert-danger" role="alert">{error}</div>}

                    <button type="submit" className="place-order-btn" disabled={!canSubmit || isLoading}>
                      {isLoading ? (
                        <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
                      ) : (
                        <i className="bi bi-lock-fill"></i>
                      )}
                      Valider et payer {formatPrice(total)}
                    </button>
                    {missing.length > 0 && (
                      <ul className="missing-list">
                        {missing.map((m) => (
                          <li key={m}>À compléter : {m}</li>
                        ))}
                      </ul>
                    )}
                    <Link href="/panier" className="back-link">
                      <i className="bi bi-arrow-left"></i> Retour au panier
                    </Link>
                  </div>
                </form>
              </div>
            </div>

            {/* Récapitulatif */}
            <div className="col-lg-5 order-lg-2 order-1">
              <div className="sw-order-summary">
                <div className="summary-header">
                  <h3>Récapitulatif</h3>
                  <span className="item-count">
                    {itemCount} article{itemCount > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="summary-products">
                  {cart.items.map((item) => (
                    <div key={item.productId} className="product-row">
                      <div className="product-img">
                        <Image src={item.image} alt={item.name} width={56} height={56} />
                        <span className="qty-badge">{item.quantity}</span>
                      </div>
                      <div className="product-detail">
                        <h5>{item.name}</h5>
                        <span className="product-variant">
                          {formatQuantity(item.quantity, item.unit)} × {formatPrice(unitPrice(item))}
                        </span>
                        {item.sellerName && <span className="product-variant">Vendu par {item.sellerName}</span>}
                        {isUpcoming(item.availableFrom) && (
                          <span className="product-variant warn">Livraison le {formatDeliveryWindow(item.availableFrom!)}</span>
                        )}
                      </div>
                      <div className="product-price">{formatPrice(unitPrice(item) * item.quantity)}</div>
                    </div>
                  ))}
                </div>
                <div className="cost-breakdown">
                  <div className="cost-line">
                    <span>Sous-total</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="cost-line">
                    <span>{isPickup ? 'Retrait sur place' : `Livraison${deliveryMethod === 'express' ? ' express' : ''}`}</span>
                    {shippingCost === 0 ? <span className="free">Gratuit</span> : <span>{formatPrice(shippingCost)}</span>}
                  </div>
                  <div className="cost-total">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  {sellerGroups.length > 1 && (
                    <p className="split-note">
                      <i className="bi bi-shop me-1"></i>
                      {sellerGroups.length} commandes seront créées, une par vendeur.
                    </p>
                  )}
                </div>
                <div className="secure-info">
                  <div className="secure-badge">
                    <i className="bi bi-shield-lock"></i>
                    <span>Paiement sécurisé</span>
                  </div>
                  <span className="secure-methods">MVola · Orange Money · Airtel Money</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

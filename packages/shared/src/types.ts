// Formes des données renvoyées par l'API (backend/src/routes/*), communes au site et à l'application.

// ---------- Catalogue ----------

export type ProductBadge = 'bio' | 'plein_air' | 'nouveau' | 'promo' | 'populaire';
export type ProductStatus = 'pending' | 'approved' | 'rejected';

export interface PriceTier {
  id?: string;
  minQty: number;
  unitPrice: number;
}

export interface ProductMetadata {
  weight?: string;
  dimensions?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  shortDescription: string;
  price: number;
  originalPrice?: number;
  images: string[];
  /** Miniatures 400 px, même ordre que `images` */
  thumbnails?: string[];
  inStock: boolean;
  stockQuantity?: number;
  badges: ProductBadge[];
  metadata?: ProductMetadata;
  characteristics?: string[];
  moq: number;
  unit: string;
  priceTiers: PriceTier[];
  estimatedWeightKg?: number | null;
  freeShipping: boolean;
  availableFrom?: string | null;
  rating?: number | null;
  reviewCount?: number;
  /** Entreprise vendeuse (null = produit de la plateforme) */
  seller?: { id: string; name: string } | null;
  status?: ProductStatus;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPage {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ProductReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  author: string;
}

export interface ProductReviews {
  average: number | null;
  count: number;
  reviews: ProductReview[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  order: number;
  isActive: boolean;
}

// ---------- Panier ----------

export interface CartItem {
  productId: string;
  name: string;
  /** Prix de base (le palier applicable est recalculé à partir de `priceTiers`) */
  price: number;
  quantity: number;
  image: string;
  slug: string;
  freeShipping?: boolean;
  estimatedWeightKg?: number | null;
  availableFrom?: string | null;
  moq: number;
  unit: string;
  priceTiers: PriceTier[];
  /** Vendeur : le backend crée une commande par vendeur */
  sellerId?: string | null;
  sellerName?: string | null;
}

// ---------- Comptes ----------

export type UserRole = 'platform_admin' | 'company_admin' | 'buyer' | 'customer';
export type CompanyStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface CompanySummary {
  id: string;
  name: string;
  status: CompanyStatus;
  paymentTerms?: string | null;
  creditLimit?: number | null;
}

export interface Session {
  token: string;
  refreshToken: string;
}

export interface LoginResponse extends Session {
  success: boolean;
  user: User;
  company: CompanySummary | null;
}

export interface MeResponse {
  user: User;
  company: CompanySummary | null;
}

// ---------- Commandes ----------

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
// standard / express : à domicile (Antananarivo et environs) ; province : par transporteur ; relais : point relais
export type DeliveryMethod = 'standard' | 'express' | 'retrait' | 'province' | 'relais';

// ---------- Livraison (GET /api/shipping/options) ----------

export interface ShippingZone {
  id: string;
  name: string;
  cities: string[];
  /** Ariary, par commande (chaque vendeur expédie la sienne) */
  price: number;
  delay: string;
  /** Zone des villes absentes de toutes les autres */
  isDefault: boolean;
}

export interface PickupPoint {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  openingHours: string | null;
  instructions: string | null;
  fee: number;
}

export interface ShippingOptions {
  /** Villes desservies à domicile (standard / express) */
  localCities: string[];
  freeShippingThreshold: number;
  costs: { standard: number; express: number };
  zones: ShippingZone[];
  pickupPoints: PickupPoint[];
}

export interface OrderAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface OrderItemSummary {
  name: string;
  slug?: string;
  image?: string | null;
  quantity: number;
  price: number;
  availableFrom?: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  total: number;
  deliveryMethod: DeliveryMethod;
  /** Livraison en province : zone appliquée */
  shippingZone?: string | null;
  pickupPoint?: PickupPoint | null;
  /** Suivi du colis, renseigné à l'expédition */
  carrier?: string | null;
  trackingNumber?: string | null;
  paymentMethod?: PaymentMethodId | null;
  paymentStatus?: PaymentStatus;
  cancelReason?: string | null;
  createdAt: string;
  address?: OrderAddress | null;
  items: OrderItemSummary[];
}

export interface CheckoutInput {
  items: { productId: string; quantity: number }[];
  shippingAddress?: { street: string; city: string; postalCode: string; country?: string };
  deliveryMethod: DeliveryMethod;
  /** Mode « relais » : point relais choisi */
  pickupPointId?: string;
  paymentMethod: PaymentMethodId;
  notes?: string;
  /** Commande sans compte */
  guest?: { name: string; email: string; phone: string };
}

export interface CheckoutResponse {
  success: boolean;
  message: string;
  orderId?: string;
  orderNumber?: string;
  total?: number;
  payment?: {
    method: PaymentMethodId;
    label: string;
    number: string;
    accountName: string;
    totalAmount: number;
    expiresAt: string | null;
  };
  orders?: { id: string; orderNumber: string; status: string; total: number; sellerName: string | null }[];
}

// ---------- Paiement (Mobile Money, carte bancaire, PayPal) ----------

export type PaymentMethodId = 'mvola' | 'orange_money' | 'airtel_money' | 'stripe' | 'paypal' | 'cash_on_delivery';
export type PaymentStatus = 'awaiting' | 'submitted' | 'paid' | 'rejected';
export type PaymentAttemptStatus = 'pending' | 'completed' | 'failed' | 'review';

export interface PaymentMethodInfo {
  id: PaymentMethodId;
  label: string;
  /** Numéro marchand (vide pour la carte bancaire et PayPal) */
  number: string;
  accountName: string;
  automatic: boolean;
  /** Paiement manuel par référence possible (Mobile Money uniquement) */
  manual: boolean;
  /** Paiement à la livraison : villes desservies et montant maximal d'articles (clients connectés uniquement) */
  cashOnDelivery?: { cities: string[]; maxAmount: number };
}

export interface PaymentAttempt {
  id: string;
  provider: PaymentMethodId;
  status: PaymentAttemptStatus;
  failureReason: string | null;
  payerPhone: string;
  /** Page de paiement du prestataire (Orange Money, Stripe, PayPal), tant que la demande est en cours */
  paymentUrl: string | null;
  createdAt: string;
}

export interface InstantPayment {
  provider: PaymentMethodId;
  label: string;
  kind: 'mobile_money' | 'online';
  /** push : confirmation sur le téléphone (MVola, Airtel) ; redirect : page du prestataire (Orange, Stripe, PayPal) */
  flow: 'push' | 'redirect';
  phonePrefixes: string;
  phonePlaceholder: string;
}

export interface PaymentSummary {
  paymentStatus: PaymentStatus;
  automatic: boolean;
  demo: boolean;
  instant: InstantPayment | null;
  attempt: PaymentAttempt | null;
  expiresAt: string | null;
  cancelReason: string | null;
  method: PaymentMethodId | null;
  methodLabel: string | null;
  /** Paiement manuel par référence possible (Mobile Money) */
  manual: boolean;
  number: string | null;
  accountName: string | null;
  totalAmount: number;
  reference: string | null;
  payerPhone: string | null;
  submittedAt: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
  orders: { orderNumber: string; sellerName: string | null; total: number; status: string; paymentStatus: PaymentStatus }[];
}

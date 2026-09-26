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
export type DeliveryMethod = 'standard' | 'express' | 'retrait';

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

// ---------- Paiement Mobile Money ----------

export type PaymentMethodId = 'mvola' | 'orange_money' | 'airtel_money';
export type PaymentStatus = 'awaiting' | 'submitted' | 'paid' | 'rejected';
export type PaymentAttemptStatus = 'pending' | 'completed' | 'failed' | 'review';

export interface PaymentMethodInfo {
  id: PaymentMethodId;
  label: string;
  number: string;
  accountName: string;
  automatic: boolean;
}

export interface PaymentAttempt {
  id: string;
  provider: PaymentMethodId;
  status: PaymentAttemptStatus;
  failureReason: string | null;
  payerPhone: string;
  /** Page de paiement de l'opérateur (Orange Money), tant que la demande est en cours */
  paymentUrl: string | null;
  createdAt: string;
}

export interface InstantPayment {
  provider: PaymentMethodId;
  label: string;
  /** push : confirmation sur le téléphone (MVola, Airtel) ; redirect : page de l'opérateur (Orange) */
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

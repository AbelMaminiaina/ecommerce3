import type { PaymentMethodId, PaymentStatus } from '@/lib/api/payments';

// Types pour les produits
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
  // Avis clients : moyenne (null sans avis) et nombre d'avis
  rating?: number | null;
  reviewCount?: number;
  // Entreprise vendeuse (null = produit de la plateforme) et statut de modération
  seller?: { id: string; name: string } | null;
  status?: ProductStatus;
  rejectionReason?: string | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
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

export type ProductStatus = 'pending' | 'approved' | 'rejected';

export type ProductBadge = 'bio' | 'plein_air' | 'nouveau' | 'promo' | 'populaire';

export interface PriceTier {
  id?: string;
  minQty: number;
  unitPrice: number;
}

export interface ProductMetadata {
  weight?: string;
  dimensions?: string;
}

// Types pour le panier
export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  slug: string;
  metadata?: ProductMetadata;
  freeShipping?: boolean;
  estimatedWeightKg?: number | null;
  availableFrom?: string | null;
  moq: number;
  unit: string;
  priceTiers: PriceTier[];
  // Vendeur : sert à scinder le panier en une commande par vendeur
  sellerId?: string | null;
  sellerName?: string | null;
}

// Types pour les services
export interface Service {
  id: string;
  title: string;
  slug: string;
  description: string;
  longDescription: string;
  icon: string;
  features: string[];
  pricing?: string;
  available: boolean;
}

// Types pour le blog
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  category: BlogCategory;
  publishedAt: string;
  updatedAt?: string;
  author: Author;
  tags: string[];
  readingTime: number;
}

export type BlogCategory = 'conseils' | 'tendances' | 'guides' | 'actualites';

export interface Author {
  name: string;
  avatar: string;
  role?: string;
  bio?: string;
}

// Types pour les commandes B2B
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

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

export interface CompanyOrder {
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

// Types pour les comptes professionnels
export type CompanyStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type UserRole = 'platform_admin' | 'company_admin' | 'buyer' | 'customer';

export interface Company {
  id: string;
  name: string;
  legalName?: string | null;
  taxId: string;
  status: CompanyStatus;
  contactEmail: string;
  contactPhone?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
}

// Types pour la FAQ
export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

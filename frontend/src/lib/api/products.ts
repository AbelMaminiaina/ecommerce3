import { fetchAPI, fetchServerAPI } from './config';
import { Product } from '@/types';

interface ProductsResponse {
  products: Product[];
  total: number;
}

export async function getProducts(params?: {
  category?: string;
  search?: string;
  inStock?: boolean;
}): Promise<ProductsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.category) searchParams.set('category', params.category);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.inStock) searchParams.set('inStock', 'true');

  const query = searchParams.toString();
  const endpoint = `/products${query ? `?${query}` : ''}`;

  return fetchAPI<ProductsResponse>(endpoint);
}

export async function getProductBySlug(slug: string): Promise<Product> {
  return fetchAPI<Product>(`/products/${slug}`);
}

export async function getRelatedProducts(slug: string, limit = 4): Promise<Product[]> {
  return fetchAPI<Product[]>(`/products/${slug}/related?limit=${limit}`);
}

// ---------- Rendu serveur (Server Components, sitemap) ----------

// Catalogue public ; `query` optionnel (ex. `seller=…`). Lève une erreur si le backend répond en erreur.
export async function fetchProductsOnServer<T = Product>(query = '', init?: RequestInit): Promise<T[]> {
  const res = await fetchServerAPI(`/products${query ? `?${query}` : ''}`, init);
  if (!res.ok) throw new Error(`Impossible de charger les produits (${res.status})`);
  const data: { products?: T[] } = await res.json();
  return data.products ?? [];
}

// Fiche produit, ou null si elle n'existe pas (ou n'est plus en vente)
export async function fetchProductOnServer(slug: string): Promise<Product | null> {
  const res = await fetchServerAPI(`/products/${slug}`);
  return res.ok ? res.json() : null;
}

export async function fetchRelatedProductsOnServer(slug: string, limit = 4): Promise<Product[]> {
  try {
    const res = await fetchServerAPI(`/products/${slug}/related?limit=${limit}`);
    return res.ok ? res.json() : [];
  } catch {
    return [];
  }
}

// ---------- Administration du catalogue (platform_admin) ----------

// Tous les produits, y compris ceux retirés de la vente ; `T` = forme utilisée par l'écran admin
export async function getAllProducts<T = Product>(): Promise<{ products: T[] }> {
  return fetchAPI<{ products: T[] }>('/products?includeInactive=true');
}

export async function updateProductStock(id: string, stockQuantity: number, token: string) {
  return fetchAPI(`/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ stockQuantity }), token });
}

// Un produit déjà commandé garde son nom (l'historique des commandes l'affiche en direct)
export async function getProductOrderUsage(id: string, token: string): Promise<{ hasOrders: boolean; ordersCount: number }> {
  return fetchAPI(`/products/${id}/has-orders`, { token });
}

export async function setProductVisibility(id: string, isActive: boolean, token: string): Promise<{ message: string }> {
  return fetchAPI(`/products/${id}/visibility`, { method: 'PATCH', body: JSON.stringify({ isActive }), token });
}

// Création (sans `id`) ou mise à jour d'un produit
export async function saveProduct(data: Record<string, unknown>, token: string, id?: string): Promise<{ product?: { id: string } }> {
  return fetchAPI(id ? `/products/${id}` : '/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data), token });
}

// Remplace l'ensemble des paliers de prix d'un produit
export async function saveProductPriceTiers(id: string, tiers: { minQty: number; unitPrice: number }[], token: string) {
  return fetchAPI(`/products/${id}/price-tiers`, { method: 'PUT', body: JSON.stringify({ tiers }), token });
}

export async function deleteProduct(id: string, token: string): Promise<{ message?: string }> {
  return fetchAPI(`/products/${id}`, { method: 'DELETE', token });
}

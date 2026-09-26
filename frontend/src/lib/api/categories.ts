import { fetchAPI, fetchServerAPI } from './config';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  order: number;
  isActive: boolean;
}

export interface CategoryInput {
  name: string;
  description: string | null;
  image: string | null;
  isActive: boolean;
}

// `T` permet à l'écran admin de typer les champs supplémentaires (ex. nombre de produits)
export async function getCategories<T = Category>(): Promise<{ categories: T[] }> {
  return fetchAPI<{ categories: T[] }>('/categories');
}

// Création (sans `id`) ou mise à jour d'une catégorie (platform_admin)
export async function saveCategory(data: CategoryInput, token: string, id?: string) {
  return fetchAPI(id ? `/categories/${id}` : '/categories', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data), token });
}

export async function deleteCategory(id: string, token: string) {
  return fetchAPI(`/categories/${id}`, { method: 'DELETE', token });
}

// Rendu serveur : catégories actives, dans l'ordre d'affichage
export async function fetchActiveCategoriesOnServer(): Promise<Category[]> {
  const res = await fetchServerAPI('/categories');
  if (!res.ok) throw new Error(`Impossible de charger les catégories (${res.status})`);
  const data: { categories?: Category[] } = await res.json();
  return (data.categories ?? []).filter((c) => c.isActive).sort((a, b) => a.order - b.order);
}

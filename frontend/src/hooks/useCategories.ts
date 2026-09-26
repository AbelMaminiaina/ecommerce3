'use client';

import { useState, useEffect } from 'react';
import { getCategories, type Category } from '@/lib/api/categories';

export type { Category };

// Cache pour éviter les requêtes multiples
let cachedCategories: Category[] | null = null;
let cachePromise: Promise<Category[]> | null = null;

async function fetchCategories(): Promise<Category[]> {
  if (cachedCategories) return cachedCategories;

  if (cachePromise) return cachePromise;

  cachePromise = getCategories()
    .then(data => {
      cachedCategories = data.categories || [];
      return cachedCategories as Category[];
    })
    .catch(() => {
      cachePromise = null;
      return [] as Category[];
    });

  return cachePromise;
}

export function useCategories() {
  // Always start with empty array to avoid hydration mismatch
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Use cached data immediately if available (client-side only)
    if (cachedCategories) {
      setCategories(cachedCategories);
      setLoading(false);
      return;
    }

    fetchCategories().then(cats => {
      setCategories(cats);
      setLoading(false);
    });
  }, []);

  return { categories, loading };
}

// Fonction utilitaire pour obtenir les catégories de produits (pour filtres)
export function useProductCategories() {
  const { categories, loading } = useCategories();

  // Toutes les catégories actives sont des catégories de produits
  const productCategories = categories.filter((c) => c.isActive);

  return { categories: productCategories, loading };
}

// Fonction pour invalider le cache (après modification admin)
export function invalidateCategoriesCache() {
  cachedCategories = null;
  cachePromise = null;
}

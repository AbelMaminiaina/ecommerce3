import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { catalogApi } from '@tsena/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../queryKeys';

const PAGE_SIZE = 20;

/** Catégories actives, dans l'ordre d'affichage */
export const useCategories = () =>
  useQuery({ queryKey: queryKeys.categories(), queryFn: () => catalogApi.categories(api) });

/** Première page du catalogue (nouveautés de l'accueil) */
export const useLatestProducts = (limit = 10) =>
  useQuery({ queryKey: queryKeys.products.latest(limit), queryFn: () => catalogApi.products(api, { limit }) });

/** Catalogue paginé (défilement infini), filtré par catégorie et recherche */
export function useProductList({ category, search }: { category?: string; search?: string }) {
  const filters = { limit: PAGE_SIZE, category: category || undefined, search: search || undefined };
  const query = useInfiniteQuery({
    queryKey: queryKeys.products.list(filters),
    queryFn: ({ pageParam, signal }) => catalogApi.products(api, { ...filters, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  return {
    ...query,
    products: query.data?.pages.flatMap((p) => p.products) ?? [],
    total: query.data?.pages[0]?.total,
    /** Page suivante, sans double chargement */
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
  };
}

export const useProduct = (slug: string) =>
  useQuery({ queryKey: queryKeys.product(slug), queryFn: () => catalogApi.product(api, slug) });

export const useProductReviews = (slug: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.reviews(slug), queryFn: () => catalogApi.reviews(api, slug), enabled });

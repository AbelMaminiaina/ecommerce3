import { api } from './api';
import { SITE_URL } from './config';

/** Adresse absolue d'une image renvoyée par l'API (« /uploads/… » sur le backend, démo « /electro/… » sur le site) */
export function imageUrl(path: string | null | undefined): string | null {
  if (path && SITE_URL && path.startsWith('/') && !path.startsWith('/uploads/')) return `${SITE_URL}${path}`;
  return api.assetUrl(path);
}

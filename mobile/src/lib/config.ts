// Configuration lue au moment de la compilation (variables EXPO_PUBLIC_*, voir .env.example et eas.json)

/** Adresse de l'API, avec « /api » */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3011/api';

/**
 * Adresse du site, pour les images de démonstration (« /electro/img/… ») qu'il est seul à servir.
 * Inutile en production : site et API partagent le domaine.
 */
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/+$/, '') || null;

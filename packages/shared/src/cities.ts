// Reconnaissance des villes saisies (« Tana », « antananarivo 101 », « Toamasina II »…), alignée avec
// backend/src/lib/cities.ts : sert à l'aperçu du mode de livraison et de ses frais (le backend reste seul juge).

export const normalizeCity = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Noms courants de la capitale
const CAPITAL_ALIASES = ['antananarivo', 'tana', 'tananarive', 'antananarivo renivohitra'];

/** La ville saisie correspond-elle à l'une de ces villes ? */
export function isServedCity(city: string, cities: string[]): boolean {
  const given = normalizeCity(city);
  if (!given) return false;
  return cities.some((configured) => {
    const target = normalizeCity(configured);
    if (!target) return false;
    const names = target === 'antananarivo' ? CAPITAL_ALIASES : [target];
    return names.some((name) => given === name || given.startsWith(`${name} `) || given.includes(target));
  });
}

/** Zone de province de cette ville : la première qui la cite, sinon la zone par défaut */
export function findShippingZone<T extends { cities: string[]; isDefault: boolean }>(city: string, zones: T[]): T | null {
  return zones.find((z) => !z.isDefault && isServedCity(city, z.cities)) ?? zones.find((z) => z.isDefault) ?? null;
}

// Reconnaissance des villes saisies par les clients (« Tana », « antananarivo 101 », « Toamasina II »…).
// Sert au paiement à la livraison (villes desservies) et aux zones de livraison.

export const normalizeCity = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

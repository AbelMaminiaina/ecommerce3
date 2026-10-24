// Paiement à la livraison : même règle de ville que le backend (lib/cashOnDelivery.ts), pour prévenir le client
// avant l'envoi de la commande. Le backend reste seul juge.

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Noms courants de la capitale saisis par les clients
const CAPITAL_ALIASES = ['antananarivo', 'tana', 'tananarive', 'antananarivo renivohitra'];

export function isServedCity(city: string, cities: string[]): boolean {
  const given = normalize(city);
  if (!given) return false;
  return cities.some((configured) => {
    const target = normalize(configured);
    const names = target === 'antananarivo' ? CAPITAL_ALIASES : [target];
    return names.some((name) => given === name || given.startsWith(`${name} `) || given.includes(target));
  });
}

export type CheckoutStepId = 'contact' | 'adresse' | 'livraison' | 'confirmation';

/**
 * Étapes visibles du tunnel de commande.
 * - « Coordonnées » n'existe que pour un visiteur sans compte (connecté, l'identité vient de la session).
 * - Quand le panier ne contient que des produits en livraison offerte, l'étape « Livraison » n'a plus
 *   d'objet (aucun frais, aucun choix de méthode) : on la retire.
 */
export function filterCheckoutSteps<T extends { id: CheckoutStepId }>(
  steps: readonly T[],
  hasFreeShippingItem: boolean,
  isGuest = false,
): T[] {
  return steps.filter((s) => {
    if (s.id === 'contact') return isGuest;
    if (s.id === 'livraison') return !hasFreeShippingItem;
    return true;
  });
}

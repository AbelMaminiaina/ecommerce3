// Paiement garanti (logique pure ; routes dans routes/orderProtection.ts, tâche dans services/buyerProtection.ts).
//
// La plateforme encaisse l'argent et ne le reverse au vendeur qu'une fois la commande REÇUE :
//  - l'acheteur confirme la réception (« Tout est en ordre ») ;
//  - ou, sans litige, la réception est confirmée automatiquement BUYER_PROTECTION_DAYS jours après la livraison ;
//  - pendant ce délai, l'acheteur peut « Signaler un problème » : le reversement est bloqué jusqu'à la décision de
//    l'administrateur (remboursement de l'acheteur, ou libération de l'argent pour le vendeur).
// BUYER_PROTECTION_DAYS (défaut 3, 0 = réception confirmée dès la livraison, sans délai de litige).

const DAY_MS = 24 * 60 * 60 * 1000;

export function buyerProtectionDays(): number {
  const raw = process.env.BUYER_PROTECTION_DAYS;
  if (raw === undefined || raw.trim() === '') return 3;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 60 ? parsed : 3;
}

export interface ProtectedOrder {
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  deliveredAt: Date | null;
  receivedAt: Date | null;
  disputeOpenedAt: Date | null;
  disputeResolvedAt: Date | null;
  payoutId: string | null;
}

// Fin du délai pour signaler un problème (null tant que la commande n'est pas livrée)
export function disputeDeadline(order: Pick<ProtectedOrder, 'deliveredAt'>, days = buyerProtectionDays()): Date | null {
  return order.deliveredAt ? new Date(order.deliveredAt.getTime() + days * DAY_MS) : null;
}

export const hasOpenDispute = (order: Pick<ProtectedOrder, 'disputeOpenedAt' | 'disputeResolvedAt'>): boolean =>
  !!order.disputeOpenedAt && !order.disputeResolvedAt;

// La commande est-elle payée (ou payable à la livraison) et en route / livrée ?
const isShippedOrDelivered = (order: ProtectedOrder) => order.status === 'shipped' || order.status === 'delivered';

/** Message d'erreur si l'acheteur ne peut pas confirmer la réception ; null sinon */
export function confirmReceiptError(order: ProtectedOrder): string | null {
  if (order.receivedAt) return 'La réception de cette commande est déjà confirmée';
  if (hasOpenDispute(order)) return 'Un litige est en cours sur cette commande';
  if (!isShippedOrDelivered(order)) return "Cette commande n'a pas encore été expédiée";
  // À la livraison, l'argent est encaissé par le livreur : c'est l'administrateur qui clôt la commande
  if (order.paymentStatus !== 'paid') return "Le paiement de cette commande n'est pas encore enregistré";
  return null;
}

/** Message d'erreur si l'acheteur ne peut pas signaler de problème ; null sinon */
export function openDisputeError(order: ProtectedOrder, now = new Date(), days = buyerProtectionDays()): string | null {
  if (order.disputeOpenedAt) return 'Un problème a déjà été signalé pour cette commande';
  if (order.receivedAt || order.payoutId) return 'La réception de cette commande est déjà confirmée : contactez le service client';
  if (!isShippedOrDelivered(order)) return "Cette commande n'a pas encore été expédiée";
  if (order.paymentStatus !== 'paid') return "Le paiement de cette commande n'est pas encore enregistré";
  const deadline = disputeDeadline(order, days);
  if (deadline && deadline <= now) return 'Le délai pour signaler un problème est dépassé : contactez le service client';
  return null;
}

// État affiché à l'acheteur et au vendeur
export type ProtectionState = 'none' | 'protected' | 'disputed' | 'received' | 'refunded';

export function protectionState(order: ProtectedOrder & { disputeResolution?: string | null }): ProtectionState {
  if (order.disputeResolution === 'refund') return 'refunded';
  if (hasOpenDispute(order)) return 'disputed';
  if (order.receivedAt) return 'received';
  if (order.paymentStatus === 'paid' && order.status !== 'cancelled') return 'protected';
  return 'none';
}

// Champs du paiement garanti renvoyés au site pour une commande
export function protectionView(order: ProtectedOrder & { disputeResolution?: string | null; disputeReason?: string | null; disputeNote?: string | null }, now = new Date()) {
  return {
    protection: protectionState(order),
    deliveredAt: order.deliveredAt,
    receivedAt: order.receivedAt,
    disputeDeadline: disputeDeadline(order),
    disputeReason: order.disputeReason ?? null,
    disputeResolution: order.disputeResolution ?? null,
    disputeNote: order.disputeNote ?? null,
    canConfirmReceipt: confirmReceiptError(order) === null,
    canOpenDispute: openDisputeError(order, now) === null,
  };
}

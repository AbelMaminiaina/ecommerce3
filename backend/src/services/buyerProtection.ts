import prisma from '../lib/prisma.js';
import { buyerProtectionDays } from '../lib/buyerProtection.js';
import type { RecurringJob } from './jobs.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Paiement garanti : une commande livrée sans litige depuis BUYER_PROTECTION_DAYS jours est considérée comme reçue,
// ce qui la rend reversable au vendeur. Une seule mise à jour conditionnelle : deux passes simultanées ne
// confirment jamais deux fois, et un litige ouvert entre-temps l'emporte.
export async function autoConfirmReceipts(now: Date = new Date()): Promise<{ confirmed: number }> {
  const days = buyerProtectionDays();
  const { count } = await prisma.order.updateMany({
    where: {
      status: 'delivered',
      paymentStatus: 'paid',
      receivedAt: null,
      disputeOpenedAt: null,
      deliveredAt: { lte: new Date(now.getTime() - days * DAY_MS) },
    },
    data: { receivedAt: now, receivedBy: 'auto' },
  });
  if (count > 0) console.log(`Paiement garanti : ${count} commande(s) confirmée(s) reçue(s) automatiquement`);
  return { confirmed: count };
}

export function autoConfirmReceiptJob(): RecurringJob {
  return { name: 'auto-confirm-receipt', everyMs: CHECK_INTERVAL_MS, run: () => autoConfirmReceipts() };
}

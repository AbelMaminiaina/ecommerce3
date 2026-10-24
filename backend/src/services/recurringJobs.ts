import type { RecurringJob } from './jobs.js';
import { orderExpiryJob } from './orderExpiry.js';
import { autoPaymentReconcileJob } from './mobileMoneyPayments.js';
import { paymentReminderJob } from './paymentReminders.js';
import { lateShipmentJob, lowStockJob } from './sellerAlerts.js';
import { autoConfirmReceiptJob } from './buyerProtection.js';

// Liste unique des tâches récurrentes, partagée par l'API (index.ts) et le worker séparé (worker.ts).
// À appeler après setupDemoPayments : la configuration des opérateurs est lue à ce moment-là.
export function recurringJobs(): RecurringJob[] {
  return [
    orderExpiryJob(),
    autoPaymentReconcileJob(),
    paymentReminderJob(),
    lateShipmentJob(),
    lowStockJob(),
    autoConfirmReceiptJob(),
  ].filter(
    (job): job is RecurringJob => job !== null
  );
}

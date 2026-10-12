import type { RecurringJob } from './jobs.js';
import { orderExpiryJob } from './orderExpiry.js';
import { autoPaymentReconcileJob } from './mobileMoneyPayments.js';

// Liste unique des tâches récurrentes, partagée par l'API (index.ts) et le worker séparé (worker.ts).
// À appeler après setupDemoPayments : la configuration des opérateurs est lue à ce moment-là.
export function recurringJobs(): RecurringJob[] {
  return [orderExpiryJob(), autoPaymentReconcileJob()].filter((job): job is RecurringJob => job !== null);
}

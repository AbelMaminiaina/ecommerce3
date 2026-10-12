import { connectRedis } from './lib/redis.js';
import { startJobs, stopJobsOnSignals } from './services/jobs.js';
import { recurringJobs } from './services/recurringJobs.js';

// Processus dédié aux tâches récurrentes : `npm run worker` (dev) ou `npm run start:worker` (production),
// avec JOBS_IN_API=false sur l'API pour qu'elle ne fasse plus que les planifier.
// Exige REDIS_URL. Incompatible avec DEMO_PAYMENTS (les opérateurs simulés vivent dans le processus de l'API).
async function main() {
  if (process.env.DEMO_PAYMENTS === 'true') {
    console.error('Worker séparé incompatible avec DEMO_PAYMENTS=true : laisser les tâches dans l’API (JOBS_IN_API).');
    process.exit(1);
  }
  // Cache Redis : invalidé quand une annulation restitue du stock
  await connectRedis();
  const handle = await startJobs(recurringJobs());
  if (handle.mode !== 'queue') {
    console.error('Le worker séparé exige REDIS_URL (file BullMQ).');
    process.exit(1);
  }
  stopJobsOnSignals(handle);
}

main().catch((err) => {
  console.error('Worker startup failed:', err);
  process.exit(1);
});

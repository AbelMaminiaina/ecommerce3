import { Queue, Worker, type ConnectionOptions } from 'bullmq';

// Tâches récurrentes du backend (annulation des commandes non payées, vérification des paiements…).
// Avec Redis (REDIS_URL), elles passent par une file BullMQ : chaque passage n'est exécuté qu'une fois même si
// plusieurs instances de l'API (ou un worker séparé, `npm run worker`) tournent, et les passages réussis ou en
// échec restent consultables dans Redis. Sans Redis, repli sur de simples minuteries dans le processus.
export interface RecurringJob {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

export interface JobsHandle {
  mode: 'queue' | 'interval' | 'none';
  stop: () => Promise<void>;
}

export const JOBS_QUEUE = 'tsena-jobs';
const FALLBACK_FIRST_RUN_MS = 30 * 1000;

// BullMQ a besoin d'une connexion Redis TCP (l'API REST d'Upstash ne convient pas) et de maxRetriesPerRequest: null
export function jobsConnection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions | null {
  const url = env.REDIS_URL?.trim();
  return url ? { url, maxRetriesPerRequest: null } : null;
}

// `processJobs: false` : planifie seulement (l'API, quand un worker séparé exécute les tâches)
export async function startJobs(
  definitions: (RecurringJob | null)[],
  { processJobs = true, env = process.env }: { processJobs?: boolean; env?: NodeJS.ProcessEnv } = {}
): Promise<JobsHandle> {
  const jobs = definitions.filter((job): job is RecurringJob => job !== null);
  const connection = jobsConnection(env);

  if (!connection) {
    if (!processJobs || jobs.length === 0) return { mode: 'none', stop: async () => {} };
    const timers = jobs.flatMap((job) => {
      const run = () => job.run().catch((err) => console.error(`Job ${job.name} failed:`, err));
      return [setTimeout(run, FALLBACK_FIRST_RUN_MS).unref(), setInterval(run, job.everyMs).unref()];
    });
    console.log(`Tâches récurrentes (minuteries, sans Redis) : ${jobs.map((job) => job.name).join(', ')}`);
    return { mode: 'interval', stop: async () => timers.forEach(clearTimeout) };
  }

  const queue = new Queue(JOBS_QUEUE, {
    connection,
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
  });
  queue.on('error', (err) => console.error('Jobs queue error:', err.message));

  // Une tâche désactivée depuis le dernier démarrage ne doit plus être planifiée
  const names = new Set(jobs.map((job) => job.name));
  for (const scheduler of await queue.getJobSchedulers()) {
    if (scheduler.key && !names.has(scheduler.key)) await queue.removeJobScheduler(scheduler.key);
  }
  for (const job of jobs) {
    await queue.upsertJobScheduler(job.name, { every: job.everyMs }, { name: job.name });
  }

  let worker: Worker | null = null;
  if (processJobs) {
    const byName = new Map(jobs.map((job) => [job.name, job]));
    worker = new Worker(
      JOBS_QUEUE,
      async (task) => {
        const job = byName.get(task.name);
        if (!job) throw new Error(`Tâche inconnue : ${task.name}`);
        return job.run();
      },
      { connection, concurrency: Math.max(jobs.length, 1) }
    );
    worker.on('failed', (task, err) => console.error(`Job ${task?.name ?? '?'} failed:`, err));
    worker.on('error', (err) => console.error('Jobs worker error:', err.message));
  }

  console.log(
    `Tâches récurrentes (BullMQ${processJobs ? '' : ', exécutées par un worker séparé'}) : ${jobs.map((job) => job.name).join(', ') || 'aucune'}`
  );
  return {
    mode: 'queue',
    stop: async () => {
      await worker?.close();
      await queue.close();
    },
  };
}

// Laisse les tâches en cours se terminer avant l'arrêt du processus (docker stop, Ctrl+C)
export function stopJobsOnSignals(handle: JobsHandle): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      handle
        .stop()
        .catch((err) => console.error('Jobs shutdown failed:', err))
        .finally(() => process.exit(0));
    });
  }
}

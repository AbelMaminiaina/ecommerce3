import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const bull = vi.hoisted(() => ({
  queue: {
    on: vi.fn(),
    getJobSchedulers: vi.fn(),
    removeJobScheduler: vi.fn(),
    upsertJobScheduler: vi.fn(),
    close: vi.fn(),
  },
  worker: { on: vi.fn(), close: vi.fn() },
  Queue: vi.fn(),
  Worker: vi.fn(),
}));

vi.mock('bullmq', () => ({ Queue: bull.Queue, Worker: bull.Worker }));

import { startJobs, jobsConnection, JOBS_QUEUE, type RecurringJob } from './jobs.js';

const job = (name: string, run = vi.fn().mockResolvedValue('ok')): RecurringJob => ({ name, everyMs: 60_000, run });
const REDIS = { REDIS_URL: 'redis://:secret@redis:6379' } as NodeJS.ProcessEnv;

beforeEach(() => {
  vi.clearAllMocks();
  bull.Queue.mockImplementation(function () { return bull.queue; });
  bull.Worker.mockImplementation(function () { return bull.worker; });
  bull.queue.getJobSchedulers.mockResolvedValue([]);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(console.log).mockRestore();
});

describe('jobsConnection', () => {
  it('exige REDIS_URL et désactive la limite de tentatives (requis par BullMQ)', () => {
    expect(jobsConnection({} as NodeJS.ProcessEnv)).toBeNull();
    expect(jobsConnection({ REDIS_URL: '  ' } as NodeJS.ProcessEnv)).toBeNull();
    expect(jobsConnection(REDIS)).toEqual({ url: REDIS.REDIS_URL, maxRetriesPerRequest: null });
  });
});

describe('startJobs sans Redis', () => {
  it('repli sur des minuteries : premier passage après 30 s, puis à chaque intervalle', async () => {
    vi.useFakeTimers();
    const expiry = job('order-expiry');
    const handle = await startJobs([expiry, null], { env: {} as NodeJS.ProcessEnv });

    expect(handle.mode).toBe('interval');
    expect(bull.Queue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expiry.run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expiry.run).toHaveBeenCalledTimes(2);

    await handle.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(expiry.run).toHaveBeenCalledTimes(2);
  });

  it('une tâche en échec est journalisée sans arrêter les suivantes', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = job('payment-reconcile', vi.fn().mockRejectedValue(new Error('opérateur indisponible')));
    const handle = await startJobs([failing], { env: {} as NodeJS.ProcessEnv });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(failing.run).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('Job payment-reconcile failed:', expect.any(Error));
    await handle.stop();
    error.mockRestore();
  });

  it('ne lance rien sans tâche ni quand l’API délègue à un worker', async () => {
    expect((await startJobs([], { env: {} as NodeJS.ProcessEnv })).mode).toBe('none');
    expect((await startJobs([job('a')], { processJobs: false, env: {} as NodeJS.ProcessEnv })).mode).toBe('none');
  });
});

describe('startJobs avec Redis (BullMQ)', () => {
  it('planifie chaque tâche et retire celles qui ne sont plus actives', async () => {
    bull.queue.getJobSchedulers.mockResolvedValue([{ key: 'order-expiry' }, { key: 'ancienne-tache' }]);
    const handle = await startJobs([job('order-expiry'), job('payment-reconcile')], { env: REDIS });

    expect(handle.mode).toBe('queue');
    expect(bull.Queue).toHaveBeenCalledWith(JOBS_QUEUE, expect.objectContaining({ connection: jobsConnection(REDIS) }));
    expect(bull.queue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(bull.queue.removeJobScheduler).toHaveBeenCalledWith('ancienne-tache');
    expect(bull.queue.upsertJobScheduler).toHaveBeenCalledWith('order-expiry', { every: 60_000 }, { name: 'order-expiry' });
    expect(bull.queue.upsertJobScheduler).toHaveBeenCalledWith('payment-reconcile', { every: 60_000 }, { name: 'payment-reconcile' });
  });

  it('le worker exécute la tâche correspondant au nom reçu', async () => {
    const expiry = job('order-expiry', vi.fn().mockResolvedValue({ cancelled: ['ORD-1'] }));
    await startJobs([expiry], { env: REDIS });

    const processor = bull.Worker.mock.calls[0][1] as (task: { name: string }) => Promise<unknown>;
    await expect(processor({ name: 'order-expiry' })).resolves.toEqual({ cancelled: ['ORD-1'] });
    await expect(processor({ name: 'inconnue' })).rejects.toThrow('Tâche inconnue : inconnue');
  });

  it('planifie sans exécuter quand un worker séparé s’en charge', async () => {
    const handle = await startJobs([job('order-expiry')], { processJobs: false, env: REDIS });

    expect(bull.queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(bull.Worker).not.toHaveBeenCalled();
    await handle.stop();
    expect(bull.queue.close).toHaveBeenCalled();
  });

  it('stop ferme le worker puis la file', async () => {
    const handle = await startJobs([job('order-expiry')], { env: REDIS });
    await handle.stop();
    expect(bull.worker.close).toHaveBeenCalled();
    expect(bull.queue.close).toHaveBeenCalled();
  });
});

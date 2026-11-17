import { internalWarn } from '../core/capture';
import { recordEnqueued, runTracked, runTrackedMany, RunInfo } from '../core/jobs';

export { trackJob } from '../core/jobs';

/*
 * Queue integrations. Each one patches a queue/scheduler instance you already
 * created, so your job code and payloads stay exactly as they are:
 * - queued jobs are recorded (and linked to the request that queued them)
 * - processors run with console capture, and end up completed or failed
 * The libraries are not imported here; any compatible instance works.
 */

type AnyFn = (...args: any[]) => any;

const once = <T extends object>(target: T, marker: string) => {
    if ((target as any)[marker]) return false;
    Object.defineProperty(target, marker, { value: true });
    return true;
};

const asError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));

/**
 * Wrap a processor that may be promise-style `(job) => …` or callback-style
 * `(job, done) => …`, keeping its arity so the library treats it the same way.
 */
const wrapProcessor = (original: AnyFn, infoOf: (job: any) => RunInfo): AnyFn => {
    if (original.length > 1) {
        return function (this: unknown, job: any, done: (err?: Error | null, result?: unknown) => void) {
            runTracked(infoOf(job), () => new Promise((resolve, reject) => {
                original.call(this, job, (err?: unknown, result?: unknown) => (err ? reject(asError(err)) : resolve(result)));
            })).then(result => done(null, result), err => done(asError(err)));
        };
    }
    return function (this: unknown, job: any, ...rest: any[]) {
        return runTracked(infoOf(job), () => original.call(this, job, ...rest));
    };
};

const delayedOf = (job: any) => (job?.opts?.delay || 0) > 0;

/** Patch add/addBulk on a Bull or BullMQ queue to record queued jobs. */
const patchAdd = (queue: { add: AnyFn; addBulk?: AnyFn }, ref: (job: any) => RunInfo) => {
    const add = queue.add.bind(queue);
    queue.add = (async (...args: any[]) => {
        const job = await add(...args);
        if (job) await recordEnqueued(ref(job), job.data, delayedOf(job));
        return job;
    }) as any;
    if (queue.addBulk) {
        const addBulk = queue.addBulk.bind(queue);
        queue.addBulk = (async (...args: any[]) => {
            const jobs = await addBulk(...args);
            for (const job of jobs || []) await recordEnqueued(ref(job), job.data, delayedOf(job));
            return jobs;
        }) as any;
    }
};

/** Bull (https://github.com/OptimalBits/bull): `trackBullQueue(new Queue('emails'))` */
export const trackBullQueue = <Q extends { name: string; add: AnyFn; process: AnyFn; addBulk?: AnyFn }>(queue: Q): Q => {
    if (!once(queue, '__apiLogsTracked')) return queue;
    const ref = (job: any) => ({
        library: 'bull',
        queue: queue.name,
        name: job.name && job.name !== '__default__' ? job.name : queue.name,
        jobId: String(job.id),
    });
    patchAdd(queue, ref);

    const process = queue.process.bind(queue);
    queue.process = ((...args: any[]) => {
        const last = args[args.length - 1];
        if (typeof last === 'function') {
            args[args.length - 1] = wrapProcessor(last, job => ({ ...ref(job), payload: job.data, attempt: (job.attemptsMade || 0) + 1 }));
        } else {
            internalWarn(`Bull queue "${queue.name}": sandboxed (file) processors can't be tracked; their jobs show as queued only.`);
        }
        return process(...args);
    }) as any;
    return queue;
};

/** BullMQ queue: `trackBullMQQueue(new Queue('emails'))` records queued jobs. */
export const trackBullMQQueue = <Q extends { name: string; add: AnyFn; addBulk?: AnyFn }>(queue: Q): Q => {
    if (!once(queue, '__apiLogsTracked')) return queue;
    patchAdd(queue, job => ({ library: 'bullmq', queue: queue.name, name: job.name, jobId: String(job.id) }));
    return queue;
};

/**
 * BullMQ worker processor:
 * `new Worker('emails', bullmqProcessor('emails', async job => { … }), opts)`
 */
export const bullmqProcessor = <F extends (job: any, ...rest: any[]) => any>(queueName: string, processor: F): F =>
    wrapProcessor(processor, job => ({
        library: 'bullmq',
        queue: queueName,
        name: job.name,
        jobId: String(job.id),
        payload: job.data,
        attempt: (job.attemptsMade || 0) + 1,
    })) as F;

/** Agenda: `trackAgenda(agenda)` before calling `agenda.define(...)`. */
export const trackAgenda = <A extends { define: AnyFn; now?: AnyFn; schedule?: AnyFn }>(agenda: A): A => {
    if (!once(agenda, '__apiLogsTracked')) return agenda;
    const ref = (job: any) => ({
        library: 'agenda',
        queue: 'agenda',
        name: job.attrs?.name,
        jobId: String(job.attrs?._id),
    });

    const define = agenda.define.bind(agenda);
    agenda.define = ((name: string, ...rest: any[]) => {
        const i = rest.findIndex(a => typeof a === 'function');
        if (i !== -1) rest[i] = wrapProcessor(rest[i], job => ({ ...ref(job), payload: job.attrs?.data }));
        return define(name, ...rest);
    }) as any;

    const recordJobs = async (result: any) => {
        for (const job of Array.isArray(result) ? result : [result]) {
            if (job?.attrs?._id) {
                const at = job.attrs.nextRunAt ? new Date(job.attrs.nextRunAt).getTime() : 0;
                await recordEnqueued(ref(job), job.attrs.data, at > Date.now() + 1000);
            }
        }
        return result;
    };
    for (const method of ['now', 'schedule'] as const) {
        const original = agenda[method];
        if (typeof original !== 'function') continue;
        (agenda as any)[method] = async (...args: any[]) => recordJobs(await original.apply(agenda, args));
    }
    return agenda;
};

/** pg-boss: `trackPgBoss(boss)` before calling `boss.work(...)`. */
export const trackPgBoss = <B extends { send: AnyFn; work: AnyFn; sendAfter?: AnyFn }>(boss: B): B => {
    if (!once(boss, '__apiLogsTracked')) return boss;
    const ref = (name: string, id: string) => ({ library: 'pg-boss', queue: name, name, jobId: String(id) });

    const send = boss.send.bind(boss);
    boss.send = (async (...args: any[]) => {
        const id = await send(...args);
        // send(name, data, options) or send({ name, data, options })
        const [name, data, options] = typeof args[0] === 'object' && args[0]
            ? [args[0].name, args[0].data, args[0].options]
            : args;
        if (id) await recordEnqueued(ref(name, id), data, !!options?.startAfter);
        return id;
    }) as any;
    if (boss.sendAfter) {
        const sendAfter = boss.sendAfter.bind(boss);
        boss.sendAfter = (async (name: string, data: unknown, options: unknown, after: unknown) => {
            const id = await sendAfter(name, data, options, after);
            if (id) await recordEnqueued(ref(name, id), data, true);
            return id;
        }) as any;
    }

    const work = boss.work.bind(boss);
    boss.work = ((name: string, ...rest: any[]) => {
        const i = rest.findIndex(a => typeof a === 'function');
        if (i !== -1) {
            const handler = rest[i];
            const info = (job: any): RunInfo => ({
                ...ref(job.name || name, job.id),
                payload: job.data,
                ...(typeof job.retryCount === 'number' ? { attempt: job.retryCount + 1 } : {}),
            });
            // Current pg-boss passes an array of jobs; older versions passed one job.
            rest[i] = (jobs: any) => Array.isArray(jobs)
                ? runTrackedMany(jobs.map(info), () => handler(jobs))
                : runTracked(info(jobs), () => handler(jobs));
        }
        return work(name, ...rest);
    }) as any;
    return boss;
};

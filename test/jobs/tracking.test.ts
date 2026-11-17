import express from "express";
import request from "supertest";
import ApiLog from "../../src/models/apilogs.model";
import JobLog from "../../src/models/joblog.model";
import ApiLogBlob from "../../src/models/apilogblob.model";
import { logMiddleware } from "../../src/adapters/express";
import { getWriter } from "../../src/core";
import { trackJob, trackBullQueue, trackPgBoss } from "../../src/jobs";

/** Just enough of Bull's Queue to exercise the integration. */
const fakeBullQueue = (name: string) => {
	let nextId = 1;
	let handler: any;
	const queue = {
		name,
		async add(...args: any[]) {
			const [jobName, data, opts] = typeof args[0] === "string" ? args : ["__default__", args[0], args[1]];
			return { id: nextId++, name: jobName, data, opts: opts || {}, attemptsMade: 0 };
		},
		process(...args: any[]) {
			handler = args[args.length - 1];
		},
		/** Run a job the way Bull does: promise-style, or callback-style when the handler takes `done`. */
		run(job: any) {
			if (handler.length > 1) {
				return new Promise((resolve, reject) => handler(job, (err: any, result: any) => (err ? reject(err) : resolve(result))));
			}
			return handler(job);
		},
	};
	return queue;
};

const waitFor = async (check: () => Promise<boolean>, timeoutMs = 5000) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await check()) return;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error("timed out");
};

describe("job tracking", () => {
	it("trackJob records a completed run with console output and the result", async () => {
		const result = await trackJob("send-invoice", { orderId: 7, apiKey: "secret" }, async () => {
			console.log("sending invoice 7");
			return { sent: true };
		});
		expect(result).toEqual({ sent: true });
		const job = await JobLog.findOne({ name: "send-invoice" }).lean();
		expect(job).toMatchObject({ library: "custom", status: "completed", attempts: 1 });
		expect(job!.sessionLogs.join("\n")).toContain("sending invoice 7");
		const payload = await ApiLogBlob.findById(job!.payloadRef).lean();
		expect(payload!.data).toEqual({ orderId: 7, apiKey: "********" });
	});

	it("trackJob records failures and rethrows the original error", async () => {
		await expect(
			trackJob("explode", {}, async () => {
				throw new Error("boom");
			})
		).rejects.toThrow("boom");
		const job = await JobLog.findOne({ name: "explode" }).lean();
		expect(job!.status).toBe("failed");
		expect(job!.error).toContain("boom");
	});

	it("Bull: records queued jobs and runs promise- and callback-style processors", async () => {
		const queue = trackBullQueue(fakeBullQueue("emails"));
		queue.process(async (job: any) => {
			console.log("emailing", job.data.to);
			return "ok";
		});
		const job = await queue.add({ to: "ada@x.com" });
		expect((await JobLog.findOne({ jobId: "1" }).lean())!.status).toBe("waiting");
		expect(await queue.run(job)).toBe("ok");
		const done = await JobLog.findOne({ jobId: "1" }).lean();
		expect(done).toMatchObject({ status: "completed", queue: "emails", name: "emails", attempts: 1 });
		expect(done!.sessionLogs.join()).toContain("emailing ada@x.com");
		expect(await JobLog.countDocuments({})).toBe(1);

		const cbQueue = trackBullQueue(fakeBullQueue("callbacks"));
		cbQueue.process((job: any, done: any) => setTimeout(() => done(new Error("smtp down")), 5));
		const cbJob = await cbQueue.add("notify", { n: 1 }, { delay: 1000 });
		expect((await JobLog.findOne({ queue: "callbacks" }).lean())!.status).toBe("delayed");
		await expect(cbQueue.run(cbJob)).rejects.toThrow("smtp down");
		expect((await JobLog.findOne({ queue: "callbacks" }).lean())!).toMatchObject({ status: "failed", name: "notify" });
	});

	it("Bull: a retry updates the same record with the attempt number", async () => {
		const queue = trackBullQueue(fakeBullQueue("retry"));
		let calls = 0;
		queue.process(async () => {
			if (++calls === 1) throw new Error("first try fails");
			return "ok";
		});
		const job = await queue.add({});
		await expect(queue.run(job)).rejects.toThrow();
		await queue.run({ ...job, attemptsMade: 1 });
		const records = await JobLog.find({ queue: "retry" }).lean();
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({ status: "completed", attempts: 2, error: null });
	});

	it("links a job to the request that queued it", async () => {
		const queue = trackBullQueue(fakeBullQueue("webhooks"));
		queue.process(async () => "processed");
		const app = express();
		app.use(logMiddleware(["/api"]));
		app.post("/api/webhook", async (_req, res) => {
			await queue.add({ event: "order.paid" });
			res.json({ received: true });
		});
		await request(app).post("/api/webhook").expect(200);
		await getWriter().flush();
		await waitFor(async () => (await ApiLog.countDocuments({ endpoint: "/api/webhook" })) === 1);

		const log = await ApiLog.findOne({ endpoint: "/api/webhook" }).lean();
		const job = await JobLog.findOne({ queue: "webhooks" }).lean();
		expect(String(job!.requestLogId)).toBe(String(log!._id));
	});

	it("pg-boss style: send records the job and batch handlers are tracked per job", async () => {
		let handler: any;
		let nextId = 100;
		const boss = trackPgBoss({
			async send(name: string, _data: unknown) {
				return `id-${nextId++}`;
			},
			async work(_name: string, fn: any) {
				handler = fn;
				return "worker-1";
			},
		});
		await boss.work("reports", async (jobs: any[]) => {
			console.log(`building ${jobs.length} reports`);
		});
		const a = await boss.send("reports", { day: 1 });
		const b = await boss.send("reports", { day: 2 });
		await handler([
			{ id: a, name: "reports", data: { day: 1 } },
			{ id: b, name: "reports", data: { day: 2 } },
		]);
		const jobs = await JobLog.find({ library: "pg-boss" }).lean();
		expect(jobs).toHaveLength(2);
		expect(jobs.every((j) => j.status === "completed")).toBe(true);
		expect(jobs[0].sessionLogs.join()).toContain("building 2 reports");
	});

	it("never breaks the queue when tracking can't be written", async () => {
		const queue = trackBullQueue(fakeBullQueue("resilient"));
		queue.process(async () => "still works");
		const spy = jest.spyOn(JobLog, "findOneAndUpdate").mockRejectedValue(new Error("db down") as never);
		try {
			const job = await queue.add({});
			expect(await queue.run(job)).toBe("still works");
		} finally {
			spy.mockRestore();
		}
	});
});

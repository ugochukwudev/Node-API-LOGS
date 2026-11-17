import { spawn, spawnSync, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import net from "net";
import mongoose from "mongoose";
import JobLog from "../../src/models/joblog.model";
import { trackBullQueue, trackBullMQQueue, bullmqProcessor, trackAgenda, trackPgBoss } from "../../src/jobs";

// Real-library checks. Redis and Postgres tests run only where those servers
// are installed locally (skipped on CI); Agenda always runs on the test MongoDB.

const has = (cmd: string) => spawnSync("which", [cmd]).status === 0;
const freePort = () =>
	new Promise<number>((resolve) => {
		const srv = net.createServer().listen(0, () => {
			const { port } = srv.address() as net.AddressInfo;
			srv.close(() => resolve(port));
		});
	});

const waitForJob = async (filter: Record<string, unknown>, status: string, timeoutMs = 15000) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const job = await JobLog.findOne({ ...filter, status }).lean();
		if (job) return job;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`job ${JSON.stringify(filter)} never reached ${status}`);
};

const nodeMajorMinor = process.versions.node.split(".").map(Number);
const nodeAtLeast = (major: number, minor: number) =>
	nodeMajorMinor[0] > major || (nodeMajorMinor[0] === major && nodeMajorMinor[1] >= minor);

(has("redis-server") ? describe : describe.skip)("with Redis", () => {
	let redis: ChildProcess;
	let port: number;

	beforeAll(async () => {
		port = await freePort();
		redis = spawn("redis-server", ["--port", String(port), "--save", "", "--appendonly", "no"], { stdio: "ignore" });
		await new Promise((r) => setTimeout(r, 500));
	});

	afterAll(() => {
		redis?.kill();
	});

	it("Bull: queued, processed with console output, completed", async () => {
		const Queue = require("bull");
		const queue = trackBullQueue(new Queue("bull-real", { redis: { port } }));
		queue.process(async (job: any) => {
			console.log("bull processing", job.data.n);
			return { doubled: job.data.n * 2 };
		});
		try {
			await queue.add({ n: 21 });
			const job = await waitForJob({ library: "bull", queue: "bull-real" }, "completed");
			expect(job.sessionLogs.join()).toContain("bull processing 21");
			expect(job.attempts).toBe(1);
		} finally {
			await queue.close();
		}
	});

	it("BullMQ: queued, processed, failed with the error", async () => {
		const { Queue, Worker } = require("bullmq");
		const connection = { host: "127.0.0.1", port };
		const queue = trackBullMQQueue(new Queue("bullmq-real", { connection }));
		const worker = new Worker(
			"bullmq-real",
			bullmqProcessor("bullmq-real", async (job: any) => {
				console.log("bullmq processing", job.name);
				throw new Error("payment provider timeout");
			}),
			{ connection }
		);
		try {
			await queue.add("charge", { amount: 100 });
			const job = await waitForJob({ library: "bullmq", name: "charge" }, "failed");
			expect(job.error).toContain("payment provider timeout");
			expect(job.sessionLogs.join()).toContain("bullmq processing charge");
		} finally {
			await worker.close();
			await queue.close();
		}
	});
});

// Agenda 6 and pg-boss 12 are ESM-only, which Jest's CommonJS loader can't
// import, so those scenarios run in a child Node process against the compiled
// package, writing to the same test database.
const ROOT = path.resolve(__dirname, "../..");
let distDir: string;

const buildDist = () => {
	if (distDir) return distDir;
	// Inside the project so the compiled files resolve its node_modules.
	distDir = fs.mkdtempSync(path.join(ROOT, ".test-dist-"));
	const tsc = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", ROOT, "--outDir", distDir], { encoding: "utf8" });
	if (tsc.status !== 0) throw new Error(tsc.stdout + tsc.stderr);
	return distDir;
};

const runScenario = (body: string, env: Record<string, string> = {}) => {
	const dist = buildDist();
	const file = path.join(dist, `scenario-${Date.now()}.mjs`);
	const { host, port, name } = mongoose.connection;
	fs.writeFileSync(
		file,
		`import { createRequire } from "module";
const require = createRequire(${JSON.stringify(path.join(ROOT, "package.json"))});
const mongoose = require("mongoose");
const jobs = require(${JSON.stringify(path.join(dist, "jobs/index.js"))});
await mongoose.connect(${JSON.stringify(`mongodb://${host}:${port}/${name}`)});
const waitFor = async (check) => { for (let i = 0; i < 150; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error("timed out"); };
const JobLog = mongoose.model("ApiJobLog");
try {
${body}
} finally {
  await mongoose.disconnect();
}
`
	);
	const result = spawnSync(process.execPath, [file], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env }, timeout: 60000 });
	if (result.status !== 0) throw new Error(result.stdout + result.stderr);
};

afterAll(() => {
	if (distDir) fs.rmSync(distDir, { recursive: true, force: true });
});

describe("with Agenda", () => {
	it("records now() jobs and their runs", async () => {
		const { host, port } = mongoose.connection;
		runScenario(`
const { Agenda } = await import("agenda");
const { MongoBackend } = await import("@agendajs/mongo-backend");
const agenda = jobs.trackAgenda(new Agenda({ backend: new MongoBackend({ address: ${JSON.stringify(`mongodb://${host}:${port}/agenda-test`)} }), processEvery: 100 }));
agenda.define("welcome-email", async (job) => { console.log("welcoming", job.attrs.data.email); });
await agenda.start();
await agenda.now("welcome-email", { email: "ada@x.com", password: "hunter2" });
await waitFor(async () => !!(await JobLog.findOne({ library: "agenda", status: "completed" })));
await agenda.stop();
`);
		const job = await waitForJob({ library: "agenda", name: "welcome-email" }, "completed");
		expect(job.sessionLogs.join()).toContain("welcoming ada@x.com");
		expect(await JobLog.countDocuments({ library: "agenda" })).toBe(1);
	});
});

(has("initdb") && has("pg_ctl") && nodeAtLeast(22, 12) ? describe : describe.skip)("with Postgres", () => {
	let dir: string;
	let port: number;

	beforeAll(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "pgboss-test-"));
		port = await freePort();
		spawnSync("initdb", ["-D", path.join(dir, "data"), "-U", "postgres", "--auth=trust"], { stdio: "ignore" });
		spawnSync("pg_ctl", ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1`, "-w", "start"], {
			stdio: "ignore",
		});
	}, 60000);

	afterAll(() => {
		spawnSync("pg_ctl", ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { stdio: "ignore" });
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("pg-boss: send is recorded and the worker run completes", async () => {
		runScenario(`
const { PgBoss } = await import("pg-boss");
const boss = jobs.trackPgBoss(new PgBoss("postgres://postgres@127.0.0.1:${port}/postgres"));
boss.on("error", () => {});
await boss.start();
await boss.createQueue("reports");
await boss.work("reports", { pollingIntervalSeconds: 0.5 }, async (list) => { console.log("report for", list[0].data.day); });
await boss.send("reports", { day: "2026-11-17" });
await waitFor(async () => !!(await JobLog.findOne({ library: "pg-boss", status: "completed" })));
await boss.stop({ graceful: false, wait: true });
`);
		const job = await waitForJob({ library: "pg-boss" }, "completed");
		expect(job.sessionLogs.join()).toContain("report for 2026-11-17");
		expect(await JobLog.countDocuments({ library: "pg-boss" })).toBe(1);
	});
});

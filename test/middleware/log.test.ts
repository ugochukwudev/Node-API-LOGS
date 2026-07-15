import express from "express";
import http from "http";
import { AddressInfo } from "net";
import ApiLog from "../../src/models/apilogs.model";
import { logMiddleware } from "../../src/middleware/log";

// Regression tests for the production heap leak: logMiddleware used to patch
// console/process.stdout PER REQUEST and restore on 'finish'. Concurrent or
// aborted requests corrupted the restore order, permanently chaining wrappers
// that retained every request and duplicated every later log line. The fix
// patches once at module load and routes lines via AsyncLocalStorage.

const waitForLogs = async (count: number, timeoutMs = 5000) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if ((await ApiLog.countDocuments({})) >= count) return;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error(`Timed out waiting for ${count} ApiLog docs`);
};

const listen = (app: express.Express): Promise<http.Server> =>
	new Promise((resolve) => {
		const server = app.listen(0, () => resolve(server));
	});

const get = (server: http.Server, path: string): Promise<number> =>
	new Promise((resolve, reject) => {
		const { port } = server.address() as AddressInfo;
		http.get(`http://127.0.0.1:${port}${path}`, (res) => {
			res.resume();
			res.on("end", () => resolve(res.statusCode || 0));
		}).on("error", reject);
	});

describe("logMiddleware", () => {
	let server: http.Server;

	beforeEach(async () => {
		await ApiLog.deleteMany({});
		const app = express();
		app.use(logMiddleware(["/api"]));
		app.get("/api/slow", (_req, res) => {
			console.log("marker-slow");
			setTimeout(() => res.json({ ok: "slow" }), 150);
		});
		app.get("/api/fast", (_req, res) => {
			console.log("marker-fast");
			res.json({ ok: "fast" });
		});
		app.get("/api/hang", (_req, res) => {
			console.log("marker-hang");
			// never responds — client will abort
		});
		app.get("/skipped", (_req, res) => res.json({ ok: "skipped" }));
		server = await listen(app);
	});

	afterEach((done) => {
		server.close(() => done());
	});

	it("does not stack console/stdout wrappers across requests (the leak)", async () => {
		const logRef = console.log;
		const stdoutRef = process.stdout.write;
		for (let i = 0; i < 5; i++) await get(server, "/api/fast");
		await waitForLogs(5);
		// Per-request patching would leave different (or chained) functions here.
		expect(console.log).toBe(logRef);
		expect(process.stdout.write).toBe(stdoutRef);
	});

	it("captures each request's console output into its own saved log", async () => {
		// Overlap a slow and a fast request — under the old per-request patch
		// this interleaving is exactly what corrupted the wrapper chain.
		await Promise.all([get(server, "/api/slow"), get(server, "/api/fast")]);
		await waitForLogs(2);

		const slow = await ApiLog.findOne({ endpoint: "/api/slow" }).lean();
		const fast = await ApiLog.findOne({ endpoint: "/api/fast" }).lean();
		expect(slow!.sessionLogs.join("\n")).toContain("marker-slow");
		expect(slow!.sessionLogs.join("\n")).not.toContain("marker-fast");
		expect(fast!.sessionLogs.join("\n")).toContain("marker-fast");
		expect(fast!.sessionLogs.join("\n")).not.toContain("marker-slow");
	});

	it("saves a log even when the client aborts before the response", async () => {
		const { port } = server.address() as AddressInfo;
		await new Promise<void>((resolve) => {
			const req = http.get(`http://127.0.0.1:${port}/api/hang`);
			req.on("error", () => resolve()); // socket destroyed -> ECONNRESET
			setTimeout(() => req.destroy(), 100);
		});
		await waitForLogs(1);
		const doc = await ApiLog.findOne({ endpoint: "/api/hang" }).lean();
		expect(doc!.sessionLogs.join("\n")).toContain("marker-hang");
	});

	it("does not capture or save logs for filtered routes", async () => {
		await get(server, "/skipped");
		await get(server, "/api/fast");
		await waitForLogs(1);
		expect(await ApiLog.countDocuments({ endpoint: "/skipped" })).toBe(0);
	});

	it("caps sessionLogs so one request cannot grow without bound", async () => {
		const app = express();
		app.use(logMiddleware(["/api"]));
		app.get("/api/chatty", (_req, res) => {
			for (let i = 0; i < 2000; i++) console.log(`line-${i}`);
			res.json({ ok: true });
		});
		const chattyServer = await listen(app);
		try {
			await get(chattyServer, "/api/chatty");
			await waitForLogs(1);
			const doc = await ApiLog.findOne({ endpoint: "/api/chatty" }).lean();
			expect(doc!.sessionLogs.length).toBeLessThanOrEqual(501);
			expect(doc!.sessionLogs[doc!.sessionLogs.length - 1]).toContain("[TRUNCATED]");
		} finally {
			await new Promise((r) => chattyServer.close(r));
		}
	});
});

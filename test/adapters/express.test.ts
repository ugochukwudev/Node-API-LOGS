import express from "express";
import http from "http";
import zlib from "zlib";
import { AddressInfo } from "net";
import ApiLog from "../../src/models/apilogs.model";
import ApiLogBlob from "../../src/models/apilogblob.model";
import { createExpressLogger, logMiddleware } from "../../src/adapters/express";
import { LogWriter } from "../../src/core/writer";
import { hydrateLog } from "../../src/core/blobs";
import { createRedactor, MASK } from "../../src/core/redact";
import { JWT_SECRET_ENV } from "../../src/core/config";

const waitForLogs = async (count: number, timeoutMs = 5000) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if ((await ApiLog.countDocuments({})) >= count) return;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error(`Timed out waiting for ${count} ApiLog docs`);
};

const request = (
	server: http.Server,
	method: string,
	path: string,
	body?: unknown
): Promise<number> =>
	new Promise((resolve, reject) => {
		const { port } = server.address() as AddressInfo;
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = http.request(
			{
				host: "127.0.0.1",
				port,
				method,
				path,
				headers: {
					authorization: "Bearer secret-token",
					...(payload ? { "content-type": "application/json" } : {}),
				},
			},
			(res) => {
				res.resume();
				res.on("end", () => resolve(res.statusCode || 0));
			}
		);
		req.on("error", reject);
		if (payload) req.write(payload);
		req.end();
	});

const latest = async (endpoint: string) => {
	const log = await ApiLog.findOne({ endpoint }).lean();
	return hydrateLog(log as any) as any;
};

describe("express adapter", () => {
	let server: http.Server;

	beforeEach(async () => {
		await ApiLog.deleteMany({});
		await ApiLogBlob.deleteMany({});
		const app = express();
		app.use(express.json());
		app.use(logMiddleware(["/api"]));
		app.post("/api/login", (req, res) =>
			res.json({ email: req.body.email, token: "jwt-abc", user: { id: 1 } })
		);
		app.get("/api/products", (_req, res) => res.json({ items: ["a", "b", "c"] }));
		app.get("/api/stream", (_req, res) => {
			res.setHeader("content-type", "application/json");
			res.write('{"part":');
			res.end('"two"}');
		});
		app.get("/api/gzip", (_req, res) => {
			res.setHeader("content-type", "application/json");
			res.setHeader("content-encoding", "gzip");
			res.end(zlib.gzipSync(JSON.stringify({ compressed: true })));
		});
		app.get("/api/image", (_req, res) => {
			res.setHeader("content-type", "image/png");
			res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		});
		app.get("/api/reset", (_req, res) => res.json({ ok: true }));
		server = await new Promise((resolve) => {
			const s = app.listen(0, () => resolve(s));
		});
	});

	afterEach((done) => {
		server.close(() => done());
	});

	it("masks secrets in request, response, headers and query string", async () => {
		await request(server, "POST", "/api/login", { email: "ada@company.com", password: "hunter2", otp: "" });
		await request(server, "GET", "/api/reset?token=abc123&page=2");
		await waitForLogs(2);

		const login = await latest("/api/login");
		expect(login.requestBody).toEqual({ email: "ada@company.com", password: MASK, otp: "" });
		expect(login.responseBody).toEqual({ email: "ada@company.com", token: MASK, user: { id: 1 } });
		expect(login.headers.authorization).toBe(MASK);

		expect(await ApiLog.exists({ endpoint: `/api/reset?token=${MASK}&page=2` })).toBeTruthy();

		// The raw secrets must not exist anywhere in storage.
		const everything = JSON.stringify([
			await ApiLog.find({}).lean(),
			await ApiLogBlob.find({}).lean(),
		]);
		expect(everything).not.toContain("hunter2");
		expect(everything).not.toContain("jwt-abc");
		expect(everything).not.toContain("secret-token");
		expect(everything).not.toContain("abc123");
	});

	it("stores a repeated response body only once", async () => {
		for (let i = 0; i < 5; i++) await request(server, "GET", "/api/products");
		await waitForLogs(5);
		const refs = await ApiLog.distinct("responseBodyRef", { endpoint: "/api/products" });
		expect(refs).toHaveLength(1);
		expect((await latest("/api/products")).responseBody).toEqual({ items: ["a", "b", "c"] });
	});

	it("captures streamed and compressed responses", async () => {
		await request(server, "GET", "/api/stream");
		await request(server, "GET", "/api/gzip");
		await request(server, "GET", "/api/image");
		await waitForLogs(3);
		expect((await latest("/api/stream")).responseBody).toEqual({ part: "two" });
		expect((await latest("/api/gzip")).responseBody).toEqual({ compressed: true });
		expect((await latest("/api/image")).responseBody).toBe("[binary image/png, 4 bytes]");
	});

	it("drops logs instead of buffering when the database is down", async () => {
		let connected = false;
		const writer = new LogWriter({ redactor: createRedactor(), isConnected: () => connected });
		writer.enqueue({
			method: "GET",
			endpoint: "/api/down",
			status: 200,
			responseTime: 1,
			requestBody: {},
			responseBody: {},
			headers: {},
			ip: "127.0.0.1",
			date: new Date(),
			sessionLogs: [],
		});
		await writer.flush();
		// Back up again: the dropped log must not reappear.
		connected = true;
		await writer.flush();
		writer.stop();
		expect(await ApiLog.countDocuments({ endpoint: "/api/down" })).toBe(0);
	});
});

describe("createExpressLogger", () => {
	it("refuses to start without a JWT secret", () => {
		const saved = process.env[JWT_SECRET_ENV];
		delete process.env[JWT_SECRET_ENV];
		try {
			expect(() =>
				createExpressLogger({ app: express(), mongoUri: "mongodb://unused" })
			).toThrow(/no JWT secret configured/);
		} finally {
			if (saved !== undefined) process.env[JWT_SECRET_ENV] = saved;
		}
	});
});

import Fastify from "fastify";
import ApiLog from "../../src/models/apilogs.model";
import { fastifyLogger } from "../../src/adapters/fastify";
import { getWriter } from "../../src/core";
import { hydrateLog } from "../../src/core/blobs";
import { MASK } from "../../src/core/redact";

const waitForLog = async (endpoint: string) => {
	for (let i = 0; i < 100; i++) {
		await getWriter().flush();
		const log = await ApiLog.findOne({ endpoint }).lean();
		if (log) return hydrateLog(log as any) as any;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error(`no log for ${endpoint}`);
};

describe("fastify adapter", () => {
	const build = async () => {
		const app = Fastify();
		await app.register(fastifyLogger, {
			mongoUri: "mongodb://unused",
			jwtSecret: "s",
			admins: ["cto@company.com"],
			beginswith: ["/api"],
		});
		app.post("/api/login", async (req: any) => {
			console.log("login attempt for", req.body.email);
			return { email: req.body.email, token: "jwt-abc" };
		});
		app.get("/api/fail", async (_req, reply) => {
			console.error("db timeout");
			return reply.code(503).send({ error: "unavailable" });
		});
		app.get("/health", async () => ({ ok: true }));
		await app.listen({ port: 0, host: "127.0.0.1" });
		const { port } = app.server.address() as any;
		// Real HTTP (fastify's inject helper doesn't load under Jest)
		const call = async (method: string, url: string, payload?: unknown) => {
			const res = await fetch(`http://127.0.0.1:${port}${url}`, {
				method,
				headers: payload ? { "content-type": "application/json" } : {},
				body: payload ? JSON.stringify(payload) : undefined,
			});
			return { statusCode: res.status, json: () => res.json() };
		};
		// Not the instance itself: a Fastify instance is thenable, so awaiting it would drop `call`.
		return { app, call };
	};

	it("logs requests with parsed, masked bodies and the console output of the handler", async () => {
		const { app, call } = await build();
		await call("POST", "/api/login", { email: "ada@x.com", password: "hunter2" });
		const log = await waitForLog("/api/login");
		expect(log.status).toBe(200);
		expect(log.requestBody).toEqual({ email: "ada@x.com", password: MASK });
		expect(log.responseBody).toEqual({ email: "ada@x.com", token: MASK });
		expect(log.sessionLogs.join()).toContain("login attempt for ada@x.com");
		await app.close();
	});

	it("records status codes and skips routes outside beginswith", async () => {
		const { app, call } = await build();
		await call("GET", "/api/fail");
		await call("GET", "/health");
		const log = await waitForLog("/api/fail");
		expect(log.status).toBe(503);
		expect(log.sessionLogs.join()).toContain("db timeout");
		expect(await ApiLog.countDocuments({ endpoint: "/health" })).toBe(0);
		await app.close();
	});

	it("serves the dashboard API under its path without logging it", async () => {
		const { app, call } = await build();
		const res = await call("GET", "/logs/api/logs");
		expect(res.statusCode).toBe(401);
		expect(await res.json()).toEqual({ message: "Unauthorized" });
		const login = await call("POST", "/logs/auth/login", { email: "nobody@x.com", password: "x" });
		expect(login.statusCode).toBe(400);
		await getWriter().flush();
		expect(await ApiLog.countDocuments({ endpoint: /^\/logs/ })).toBe(0);
		await app.close();
	});

	it("fails registration with the config error", async () => {
		const app = Fastify();
		await expect(app.register(fastifyLogger, { mongoUri: "x", jwtSecret: "s", admins: [] } as any)).rejects.toThrow(/no admins configured/);
	});
});

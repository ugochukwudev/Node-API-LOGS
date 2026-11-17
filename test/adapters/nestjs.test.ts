import ApiLog from "../../src/models/apilogs.model";
import { hydrateLog } from "../../src/core/blobs";
import { MASK } from "../../src/core/redact";
import { cleanupScenarios, runScenario } from "../helpers/child-scenario";

// NestJS 12 is ESM-only, so the Nest apps run in a child process (see child-scenario).
const nestScenario = (platform: "express" | "fastify") => `
await import("reflect-metadata");
const { Module, Controller, Get, Post, Body } = await import("@nestjs/common");
const { NestFactory } = await import("@nestjs/core");
const { setupNestLogger } = require(dist + "/adapters/nestjs.js");
const ApiLog = mongoose.model("ApiLog");

// Decorators applied as functions: plain JS has no decorator syntax.
class Ctl {
  hello() { console.log("hello from nest ${platform}"); return { hi: true }; }
  login(body) { return { email: body.email, token: "jwt-abc" }; }
}
Controller("api")(Ctl);
Get("hello")(Ctl.prototype, "hello", Object.getOwnPropertyDescriptor(Ctl.prototype, "hello"));
Body()(Ctl.prototype, "login", 0);
Post("login")(Ctl.prototype, "login", Object.getOwnPropertyDescriptor(Ctl.prototype, "login"));
class AppModule {}
Module({ controllers: [Ctl] })(AppModule);

${platform === "fastify"
	? 'const { FastifyAdapter } = await import("@nestjs/platform-fastify");\nconst app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });'
	: "const app = await NestFactory.create(AppModule, { logger: false });"}
await setupNestLogger(app, { mongoUri: "unused", jwtSecret: "s", admins: ["cto@company.com"], beginswith: ["/api"] });
await app.listen(0, "127.0.0.1");
const url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
await fetch(url + "/api/hello");
await fetch(url + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ada@x.com", password: "hunter2" }) });
const dash = await fetch(url + "/logs/api/logs");
console.log("DASHBOARD_STATUS=" + dash.status);
await waitFor(async () => (await ApiLog.countDocuments({ endpoint: { $in: ["/api/hello", "/api/login"] } })) === 2);
await app.close();
`;

// NestJS 12 itself needs Node 20+; the integration has no Nest dependency.
const nodeMajor = Number(process.versions.node.split(".")[0]);

(nodeMajor >= 20 ? describe : describe.skip)("NestJS", () => {
	afterAll(() => cleanupScenarios());

	for (const platform of ["express", "fastify"] as const) {
		it(`logs requests and serves the dashboard on the ${platform} platform`, async () => {
			const out = runScenario(nestScenario(platform));
			expect(out).toContain("DASHBOARD_STATUS=401");

			const hello = await ApiLog.findOne({ endpoint: "/api/hello" }).lean();
			expect(hello!.status).toBe(200);
			expect(hello!.sessionLogs.join()).toContain(`hello from nest ${platform}`);

			const login = (await hydrateLog((await ApiLog.findOne({ endpoint: "/api/login" }).lean()) as any)) as any;
			expect(login.status).toBe(201);
			expect(login.requestBody).toEqual({ email: "ada@x.com", password: MASK });
			expect(login.responseBody).toEqual({ email: "ada@x.com", token: MASK });
			expect(await ApiLog.countDocuments({ endpoint: /^\/logs/ })).toBe(0);
		});
	}
});

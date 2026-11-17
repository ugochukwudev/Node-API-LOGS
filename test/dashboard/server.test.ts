import express from "express";
import fs from "fs";
import path from "path";
import request from "supertest";
import { createDashboard, normalizeBasePath, isDashboardUrl, UI_DIR } from "../../src/dashboard/server";
import { logMiddleware } from "../../src/adapters/express";
import { setDashboardBasePath } from "../../src/core/config";
import ApiLog from "../../src/models/apilogs.model";
import { getWriter } from "../../src/core";

// The server looks for the built bundle next to itself; give it a stub in tests.
const stubUi = () => {
	fs.mkdirSync(UI_DIR, { recursive: true });
	const file = path.join(UI_DIR, "app.js");
	const created = !fs.existsSync(file);
	if (created) fs.writeFileSync(file, "/* test stub */");
	return () => created && fs.rmSync(file);
};

describe("dashboard server", () => {
	let cleanup: () => void;
	beforeAll(() => {
		cleanup = stubUi();
	});
	afterAll(() => cleanup());
	afterEach(() => setDashboardBasePath("/logs"));

	it("validates the dashboard path", () => {
		expect(normalizeBasePath(undefined)).toBe("/logs");
		expect(normalizeBasePath("_logs/")).toBe("/_logs");
		expect(normalizeBasePath("/admin/logs")).toBe("/admin/logs");
		expect(() => normalizeBasePath("/")).toThrow();
		expect(() => normalizeBasePath('/logs"><script>')).toThrow();
		expect(isDashboardUrl("/logs?x=1", "/logs")).toBe(true);
		expect(isDashboardUrl("/logsomething", "/logs")).toBe(false);
	});

	it("serves the app shell for any page under the base, with strict headers", async () => {
		const app = express();
		app.use(createDashboard("/_logs"));
		app.get("/hello", (_req, res) => res.send("host app"));

		for (const page of ["/_logs", "/_logs/requests/abc", "/_logs/settings"]) {
			const res = await request(app).get(page).expect(200);
			expect(res.text).toContain('data-base="/_logs"');
			expect(res.text).toContain('src="/_logs/assets/app.js?v=');
			expect(res.headers["content-security-policy"]).toContain("script-src 'self'");
			expect(res.headers["x-frame-options"]).toBe("DENY");
		}
		// No inline scripts in the shell
		const shell = (await request(app).get("/_logs")).text;
		expect(shell).not.toMatch(/<script>(?!<\/script>)/);

		// Everything else belongs to the host app
		expect((await request(app).get("/hello")).text).toBe("host app");
		await request(app).get("/logs").expect(404);
		await request(app).get("/_logs/api/logs").expect(401);
		await request(app).post("/_logs/nope").expect(404);
	});

	it("does not log the dashboard's own requests, wherever it is mounted", async () => {
		setDashboardBasePath("/_logs");
		const app = express();
		app.use(logMiddleware());
		app.use(createDashboard("/_logs"));
		app.get("/api/x", (_req, res) => res.json({ ok: true }));
		await request(app).get("/_logs/requests");
		await request(app).get("/api/x");
		await getWriter().flush();
		expect((await ApiLog.find({}).lean()).map((l) => l.endpoint)).toEqual(["/api/x"]);
	});
});

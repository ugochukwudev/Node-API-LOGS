import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";
import apiRoutes from "../../src/routes/api";
import User from "../../src/models/user.model";
import { EmailSettings } from "../../src/models/alerts.model";
import { getJwtSecret } from "../../src/core/config";

const app = express();
app.use(cookieParser());
app.use("/logs/api", apiRoutes);

const sessionFor = (user: any) =>
	`token=${jwt.sign({ id: String(user._id), role: user.role, purpose: "session" }, getJwtSecret(), { expiresIn: "1h" })}`;

describe("alerts routes", () => {
	let admin: any;
	let dev: any;

	beforeEach(async () => {
		admin = await User.create({ email: "cto@company.com", password: "x", role: "admin" });
		dev = await User.create({ email: "dev@company.com", password: "x", role: "dev" });
	});

	it("never returns stored secrets and keeps them when the field is left empty", async () => {
		await request(app)
			.put("/logs/api/alerts/settings")
			.set("Cookie", sessionFor(admin))
			.send({ provider: "brevo", fromEmail: "alerts@company.com", apiKey: "xkeysib-secret", dashboardUrl: "https://api.company.com/" })
			.expect(200);
		const res = await request(app)
			.put("/logs/api/alerts/settings")
			.set("Cookie", sessionFor(admin))
			.send({ provider: "brevo", fromEmail: "alerts@company.com", apiKey: "" })
			.expect(200);
		expect(JSON.stringify(res.body)).not.toContain("xkeysib-secret");
		expect(res.body.hasApiKey).toBe(true);
		const stored = await EmailSettings.findById("email").lean();
		expect(stored!.apiKeyEnc).not.toContain("xkeysib");
	});

	it("validates settings and keeps them admin-only", async () => {
		await request(app).get("/logs/api/alerts/settings").set("Cookie", sessionFor(dev)).expect(403);
		await request(app).put("/logs/api/alerts/settings").set("Cookie", sessionFor(admin)).send({ provider: "pigeon" }).expect(400);
		await request(app)
			.put("/logs/api/alerts/settings")
			.set("Cookie", sessionFor(admin))
			.send({ provider: "resend", fromEmail: "x@y.com", dashboardUrl: "ftp://nope" })
			.expect(400);
		const status = await request(app).get("/logs/api/alerts/status").set("Cookie", sessionFor(dev)).expect(200);
		expect(status.body.configured).toBe(false);
	});

	it("reports a failed test email with the provider's message", async () => {
		const res = await request(app).post("/logs/api/alerts/test").set("Cookie", sessionFor(admin)).expect(400);
		expect(res.body.message).toBe("No email provider is set up");
	});

	it("lets anyone create personal rules but only admins team rules", async () => {
		await request(app)
			.post("/logs/api/alerts/rules")
			.set("Cookie", sessionFor(dev))
			.send({ name: "Mine", statuses: "5xx" })
			.expect(200);
		await request(app)
			.post("/logs/api/alerts/rules")
			.set("Cookie", sessionFor(dev))
			.send({ name: "Everyone", statuses: "5xx", scope: "team" })
			.expect(403);
		const team = await request(app)
			.post("/logs/api/alerts/rules")
			.set("Cookie", sessionFor(admin))
			.send({ name: "Everyone", statuses: "5xx", scope: "team" })
			.expect(200);

		const devView = await request(app).get("/logs/api/alerts/rules").set("Cookie", sessionFor(dev)).expect(200);
		expect(devView.body.rules.map((r: any) => [r.name, r.canEdit])).toEqual([
			["Mine", true],
			["Everyone", false],
		]);
		await request(app).delete(`/logs/api/alerts/rules/${team.body.rule._id}`).set("Cookie", sessionFor(dev)).expect(403);

		const adminView = await request(app).get("/logs/api/alerts/rules").set("Cookie", sessionFor(admin)).expect(200);
		expect(adminView.body.rules.map((r: any) => r.name)).toEqual(["Everyone"]);
	});

	it("validates rules", async () => {
		const bad = [
			{ statuses: "5xx" },
			{ name: "x" },
			{ name: "x", statuses: "fivehundred" },
			{ name: "x", statuses: "5xx", spikeCount: 1 },
			{ name: "x", statuses: "5xx", cooldownMin: 0 },
		];
		for (const body of bad) {
			await request(app).post("/logs/api/alerts/rules").set("Cookie", sessionFor(dev)).send(body).expect(400);
		}
	});

	it("updates and deletes your own rules", async () => {
		const created = await request(app)
			.post("/logs/api/alerts/rules")
			.set("Cookie", sessionFor(dev))
			.send({ name: "Slow", minMs: 2000 })
			.expect(200);
		const id = created.body.rule._id;
		const updated = await request(app)
			.put(`/logs/api/alerts/rules/${id}`)
			.set("Cookie", sessionFor(dev))
			.send({ enabled: false })
			.expect(200);
		expect(updated.body.rule).toMatchObject({ enabled: false, minMs: 2000 });
		await request(app).put(`/logs/api/alerts/rules/${id}`).set("Cookie", sessionFor(admin)).send({ enabled: true }).expect(404);
		await request(app).delete(`/logs/api/alerts/rules/${id}`).set("Cookie", sessionFor(dev)).expect(200);
	});

	it("turns the daily summary on and off", async () => {
		await request(app).put("/logs/api/alerts/digest").set("Cookie", sessionFor(dev)).send({ enabled: true }).expect(200);
		expect((await request(app).get("/logs/api/alerts/digest").set("Cookie", sessionFor(dev))).body.enabled).toBe(true);
		expect((await User.findById(dev._id))!.dailyDigest).toBe(true);
	});
});

import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";
import apiRoutes from "../../src/routes/api";
import ApiLog from "../../src/models/apilogs.model";
import { getJwtSecret } from "../../src/core/config";
import { writeLogs } from "../helpers/write-logs";

const app = express();
app.use(cookieParser());
app.use("/logs/api", apiRoutes);

const session = (role: "admin" | "dev") =>
	`token=${jwt.sign({ id: "000000000000000000000001", role, purpose: "session" }, getJwtSecret(), { expiresIn: "1h" })}`;

describe("data routes", () => {
	beforeEach(async () => {
		await writeLogs([
			{ endpoint: "/webhooks/partner-x", status: 200, requestBody: { event: "order.paid" } },
			{ endpoint: "/api/users", status: 500 },
		]);
	});

	it("exports filtered logs as a download", async () => {
		const res = await request(app)
			.get("/logs/api/export?format=jsonl&endpoint=partner")
			.set("Cookie", session("dev"))
			.expect(200);
		expect(res.headers["content-disposition"]).toMatch(/attachment; filename="api-logs-\d+\.jsonl"/);
		const lines = res.text.trim().split("\n").map((l) => JSON.parse(l));
		expect(lines).toHaveLength(1);
		expect(lines[0].requestBody.event).toBe("order.paid");
	});

	it("rejects unknown formats and requires sign-in", async () => {
		await request(app).get("/logs/api/export?format=pdf").set("Cookie", session("dev")).expect(400);
		await request(app).get("/logs/api/export?format=csv").expect(401);
	});

	it("only lets admins delete, and never without a filter by accident", async () => {
		await request(app).post("/logs/api/logs/delete").set("Cookie", session("dev")).send({ status: "5xx" }).expect(403);
		await request(app).post("/logs/api/logs/delete").set("Cookie", session("admin")).send({}).expect(400);
		const res = await request(app)
			.post("/logs/api/logs/delete")
			.set("Cookie", session("admin"))
			.send({ status: "5xx" })
			.expect(200);
		expect(res.body.deletedLogs).toBe(1);
		expect(await ApiLog.countDocuments({})).toBe(1);

		const summaries = await request(app).get("/logs/api/summaries").set("Cookie", session("dev")).expect(200);
		expect(summaries.body.count).toBe(1);
		await request(app).post("/logs/api/summaries/delete").set("Cookie", session("dev")).send({}).expect(403);
		const deleted = await request(app).post("/logs/api/summaries/delete").set("Cookie", session("admin")).send({}).expect(200);
		expect(deleted.body.deleted).toBe(1);
	});

	it("includes summaries of deleted logs in the metrics", async () => {
		const before = await request(app).get("/logs/api/metrics?timeRange=24h").set("Cookie", session("dev")).expect(200);
		await request(app).post("/logs/api/logs/delete").set("Cookie", session("admin")).send({ all: true }).expect(200);
		const after = await request(app).get("/logs/api/metrics?timeRange=24h").set("Cookie", session("dev")).expect(200);
		expect(after.body.totalRequests).toBe(before.body.totalRequests);
		expect(after.body.errorCount).toBe(1);
	});
});

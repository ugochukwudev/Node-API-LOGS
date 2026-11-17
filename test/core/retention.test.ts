import ApiLog from "../../src/models/apilogs.model";
import ApiLogBlob from "../../src/models/apilogblob.model";
import LogSummary from "../../src/models/logsummary.model";
import { deleteLogs, deleteSummaries, statsSource } from "../../src/core/retention";
import { maskStoredLogs } from "../../src/core/migrate";
import { createRedactor, MASK } from "../../src/core/redact";
import { hydrateLog } from "../../src/core/blobs";
import { writeLogs } from "../helpers/write-logs";

const HOUR = 60 * 60 * 1000;

const totals = async (from: Date) => {
	const [r] = await ApiLog.aggregate([
		...statsSource(from),
		{
			$group: {
				_id: null,
				n: { $sum: "$n" },
				t: { $sum: "$t" },
				errors: { $sum: { $cond: [{ $gte: ["$status", 400] }, "$n", 0] } },
			},
		},
	]);
	return r ? { n: r.n, t: r.t, errors: r.errors } : { n: 0, t: 0, errors: 0 };
};

describe("deleting logs", () => {
	it("keeps chart totals identical after the logs are deleted", async () => {
		const at = new Date(Date.now() - 2 * HOUR);
		await writeLogs([
			{ endpoint: "/api/a?x=1", status: 200, responseTime: 10, date: at },
			{ endpoint: "/api/a?x=2", status: 200, responseTime: 30, date: at },
			{ endpoint: "/api/a", status: 500, responseTime: 100, date: at },
			{ endpoint: "/api/b", status: 404, responseTime: 5, date: at },
		]);
		const from = new Date(Date.now() - 24 * HOUR);
		const before = await totals(from);

		const result = await deleteLogs({});
		expect(result.deletedLogs).toBe(4);
		expect(await ApiLog.countDocuments({})).toBe(0);
		expect(await totals(from)).toEqual(before);

		// Grouped per hour + path (query string dropped) + method + status
		const a200 = await LogSummary.findOne({ endpoint: "/api/a", status: 200 }).lean();
		expect(a200).toMatchObject({ count: 2, totalTime: 40, minTime: 10, maxTime: 30 });
	});

	it("adds to existing summaries when the same hour is deleted in two goes", async () => {
		const at = new Date(Date.now() - 3 * HOUR);
		await writeLogs([{ endpoint: "/api/a", responseTime: 10, date: at }]);
		await deleteLogs({});
		await writeLogs([{ endpoint: "/api/a", responseTime: 20, date: at }]);
		await deleteLogs({});
		expect(await LogSummary.findOne({ endpoint: "/api/a" }).lean()).toMatchObject({ count: 2, totalTime: 30, maxTime: 20 });
	});

	it("only deletes what the filter matches", async () => {
		await writeLogs([{ endpoint: "/api/keep", status: 200 }, { endpoint: "/api/drop", status: 500 }]);
		await deleteLogs({ status: 500 });
		expect((await ApiLog.find({}).lean()).map((l) => l.endpoint)).toEqual(["/api/keep"]);
	});

	it("removes stored bodies no other log uses (after the safety window)", async () => {
		await writeLogs([{ endpoint: "/api/a", responseBody: { only: "me" } }]);
		await ApiLogBlob.updateMany({}, { lastSeenAt: new Date(Date.now() - HOUR) });
		const result = await deleteLogs({});
		expect(result.deletedBodies).toBeGreaterThan(0);
		expect(await ApiLogBlob.countDocuments({ text: /only/ })).toBe(0);
	});

	it("deletes summaries, all or before a date", async () => {
		await writeLogs([
			{ endpoint: "/api/a", date: new Date(Date.now() - 10 * 24 * HOUR) },
			{ endpoint: "/api/b", date: new Date(Date.now() - HOUR) },
		]);
		await deleteLogs({});
		expect(await deleteSummaries(new Date(Date.now() - 5 * 24 * HOUR))).toBe(1);
		expect(await deleteSummaries()).toBe(1);
		expect(await LogSummary.countDocuments({})).toBe(0);
	});
});

describe("mask-old-logs", () => {
	it("masks v2 inline logs and moves their bodies to store-once storage", async () => {
		await ApiLog.collection.insertOne({
			method: "POST",
			endpoint: "/login?token=abc",
			status: 200,
			responseTime: 5,
			requestBody: { email: "ada@x.com", password: "hunter2" },
			responseBody: { token: "jwt" },
			headers: { authorization: "Bearer x" },
			ip: "1.1.1.1",
			date: new Date(),
			sessionLogs: [],
		});
		expect(await maskStoredLogs(createRedactor())).toBe(1);
		const raw = await ApiLog.findOne({}).lean();
		expect(raw!.requestBody).toBeUndefined();
		expect(raw!.endpoint).toBe(`/login?token=${MASK}`);
		const log = await hydrateLog(raw!);
		expect(log.requestBody).toEqual({ email: "ada@x.com", password: MASK });
		expect(log.responseBody).toEqual({ token: MASK });
		expect((log.headers as any).authorization).toBe(MASK);
		// Running again changes nothing
		expect(await maskStoredLogs(createRedactor())).toBe(0);
	});
});

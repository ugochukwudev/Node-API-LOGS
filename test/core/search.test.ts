import ApiLog from "../../src/models/apilogs.model";
import { buildLogQuery, buildStatusQuery, SearchError } from "../../src/core/search";
import { writeLogs } from "../helpers/write-logs";

const endpointsFor = async (params: Record<string, string>) => {
	const { filter } = await buildLogQuery(params);
	return (await ApiLog.find(filter).lean()).map((l) => l.endpoint).sort();
};

const DAY = 24 * 60 * 60 * 1000;

describe("log search", () => {
	beforeEach(async () => {
		await writeLogs([
			{
				method: "POST",
				endpoint: "/webhooks/partner-x",
				status: 200,
				requestBody: { event: "order.paid", orderId: 42, live: true },
				responseBody: { ok: true },
			},
			{
				method: "POST",
				endpoint: "/webhooks/partner-x?attempt=2",
				status: 500,
				responseTime: 2500,
				requestBody: { event: "order.refunded", orderId: 43 },
				responseBody: { error: "insufficient funds" },
				sessionLogs: ["[STDERR] Payment provider timeout"],
			},
			{ endpoint: "/api/users", status: 404, ip: "10.0.0.9" },
			{ endpoint: "/api/old", status: 401, date: new Date(Date.now() - 20 * DAY) },
			{ endpoint: "/api/ancient", status: 200, date: new Date(Date.now() - 60 * DAY) },
		]);
	});

	it("parses exact codes, classes and lists", () => {
		expect(buildStatusQuery("404")).toEqual({ status: 404 });
		expect(buildStatusQuery("5xx")).toEqual({ status: { $gte: 500, $lt: 600 } });
		expect(buildStatusQuery("401, 403")).toEqual({ status: { $in: [401, 403] } });
		expect(buildStatusQuery("401,5xx")).toEqual({
			$or: [{ status: { $gte: 500, $lt: 600 } }, { status: 401 }],
		});
		expect(buildStatusQuery("nonsense")).toBeNull();
	});

	it("filters by status, method, ip and duration", async () => {
		expect(await endpointsFor({ status: "5xx" })).toEqual(["/webhooks/partner-x?attempt=2"]);
		expect(await endpointsFor({ status: "401,404" })).toEqual(["/api/old", "/api/users"]);
		expect(await endpointsFor({ method: "post" })).toHaveLength(2);
		expect(await endpointsFor({ ip: "10.0.0.9" })).toEqual(["/api/users"]);
		expect(await endpointsFor({ minMs: "2000" })).toEqual(["/webhooks/partner-x?attempt=2"]);
	});

	it("matches endpoint text anywhere, not only at the start", async () => {
		expect(await endpointsFor({ endpoint: "partner" })).toHaveLength(2);
		expect(await endpointsFor({ endpoint: "USERS" })).toEqual(["/api/users"]);
	});

	it("defaults to the last 30 days, and a from date reaches further back", async () => {
		expect(await endpointsFor({})).not.toContain("/api/ancient");
		expect(await endpointsFor({})).toContain("/api/old");
		const from = new Date(Date.now() - 90 * DAY).toISOString();
		expect(await endpointsFor({ from })).toContain("/api/ancient");
	});

	it("searches console output and body text", async () => {
		expect(await endpointsFor({ consoleText: "provider timeout" })).toEqual(["/webhooks/partner-x?attempt=2"]);
		expect(await endpointsFor({ responseText: "Insufficient Funds" })).toEqual(["/webhooks/partner-x?attempt=2"]);
		expect(await endpointsFor({ requestText: "order.paid" })).toEqual(["/webhooks/partner-x"]);
		expect(await endpointsFor({ requestText: "no such text" })).toEqual([]);
	});

	it("matches a JSON field, with numbers and booleans from the query string", async () => {
		expect(await endpointsFor({ jsonPath: "event", jsonValue: "order.paid" })).toEqual(["/webhooks/partner-x"]);
		expect(await endpointsFor({ jsonPath: "body.orderId", jsonValue: "43" })).toEqual(["/webhooks/partner-x?attempt=2"]);
		expect(await endpointsFor({ jsonPath: "live", jsonValue: "true" })).toEqual(["/webhooks/partner-x"]);
		expect(await endpointsFor({ jsonTarget: "response", jsonPath: "ok", jsonValue: "true" })).toEqual(["/webhooks/partner-x"]);
	});

	it("text searches default to the last 7 days", async () => {
		const { from } = await buildLogQuery({ consoleText: "x" });
		expect(Date.now() - from.getTime()).toBeLessThanOrEqual(7 * DAY + 1000);
	});

	it("rejects unsafe JSON field paths", async () => {
		await expect(buildLogQuery({ jsonPath: "$where", jsonValue: "1" })).rejects.toBeInstanceOf(SearchError);
		await expect(buildLogQuery({ jsonPath: "a..b", jsonValue: "1" })).rejects.toBeInstanceOf(SearchError);
	});
});

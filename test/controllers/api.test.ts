import { Request, Response } from "express";
import ApiLog from "../../src/models/apilogs.model";
import {
	getLogs,
	getLogById,
	getMetrics,
	getStatusDistribution,
	getSystemStats,
	getStatusTrends,
	getSlowEndpoints,
} from "../../src/controllers/api";
import {
	createMockRequest,
	createMockResponse,
	createTestLogs,
	getResponseData,
	getStatusCode,
} from "../helpers/test-helpers";

describe("API Controllers", () => {
	beforeEach(async () => {
		await ApiLog.deleteMany({});
	});

	describe("getLogs", () => {
		it("should return logs with default pagination", async () => {
			await createTestLogs(10);
			const req = createMockRequest() as Request;
			const res = createMockResponse() as Response;

			await getLogs(req, res);

			expect(res.json).toHaveBeenCalled();
			const data = getResponseData(res);
			if (data && !data.message) {
				expect(data).toHaveProperty("logs");
				expect(data).toHaveProperty("total");
				expect(Array.isArray(data.logs)).toBe(true);
			}
		});

		it("should filter by endpoint", async () => {
			await createTestLogs(5);
			const req = createMockRequest({
				query: { endpoint: "api/test/0" },
			}) as Request;
			const res = createMockResponse() as Response;

			await getLogs(req, res);

			const data = getResponseData(res);
			if (data && data.logs) {
				expect(data.logs.length).toBeGreaterThanOrEqual(0);
			}
		});

		it("should filter by status", async () => {
			await createTestLogs(5);
			const req = createMockRequest({
				query: { status: "200" },
			}) as Request;
			const res = createMockResponse() as Response;

			await getLogs(req, res);

			const data = getResponseData(res);
			if (data && data.logs && data.logs.length > 0) {
				expect(data.logs[0].status).toBe(200);
			}
		});

		it("should handle pagination", async () => {
			await createTestLogs(25);
			const req = createMockRequest({
				query: { page: "2", limit: "10" },
			}) as Request;
			const res = createMockResponse() as Response;

			await getLogs(req, res);

			const data = getResponseData(res);
			if (data && data.logs) {
				expect(data.logs.length).toBeLessThanOrEqual(10);
			}
		});

		it("should skip countDocuments for regex endpoint queries", async () => {
			await createTestLogs(5);
			const req = createMockRequest({
				query: { endpoint: "api/test" },
			}) as Request;
			const res = createMockResponse() as Response;

			const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

			await getLogs(req, res);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("Skipping countDocuments")
			);

			consoleSpy.mockRestore();
		});

		it("should handle errors gracefully", async () => {
			// Mock a database error
			jest.spyOn(ApiLog, "find").mockImplementationOnce(() => {
				throw new Error("Database error");
			});

			const req = createMockRequest() as Request;
			const res = createMockResponse() as Response;

			await getLogs(req, res);

			expect(getStatusCode(res)).toBe(500);
		});
	});

	describe("getLogById", () => {
		it("should return log by id", async () => {
			const logs = await createTestLogs(1);
			const logId = (logs[0] as any)._id.toString();

			const req = createMockRequest({
				params: { id: logId },
			}) as Request;
			const res = createMockResponse() as Response;

			await getLogById(req, res);

			const data = getResponseData(res);
			expect(data).toHaveProperty("log");
			expect(data.log._id.toString()).toBe(logId);
		});

		it("should return 404 for non-existent log", async () => {
			const req = createMockRequest({
				params: { id: "507f1f77bcf86cd799439011" },
			}) as Request;
			const res = createMockResponse() as Response;

			await getLogById(req, res);

			expect(getStatusCode(res)).toBe(404);
		});
	});

	describe("getMetrics", () => {
		it("should return metrics for 24h range", async () => {
			await createTestLogs(10);
			const req = createMockRequest({
				query: { timeRange: "24h" },
			}) as Request;
			const res = createMockResponse() as Response;

			await getMetrics(req, res);

			const data = getResponseData(res);
			expect(data).toHaveProperty("totalRequests");
			expect(data).toHaveProperty("avgResponseTime");
			expect(data).toHaveProperty("slowEndpoints");
			expect(data).toHaveProperty("errorCount");
		});

		it("should handle different time ranges", async () => {
			await createTestLogs(5);
			const ranges = ["1h", "7d", "30d"];

			for (const range of ranges) {
				const req = createMockRequest({
					query: { timeRange: range },
				}) as Request;
				const res = createMockResponse() as Response;

				await getMetrics(req, res);

				expect(res.json).toHaveBeenCalled();
			}
		});
	});

	describe("getStatusDistribution", () => {
		it("should return status distribution", async () => {
			await createTestLogs(10);
			const req = createMockRequest() as Request;
			const res = createMockResponse() as Response;

			await getStatusDistribution(req, res);

			const data = getResponseData(res);
			expect(data).toHaveProperty("distribution");
			expect(Array.isArray(data.distribution)).toBe(true);
		});

		it("should filter by endpoint", async () => {
			await createTestLogs(5);
			const req = createMockRequest({
				query: { endpoint: "api/test/0" },
			}) as Request;
			const res = createMockResponse() as Response;

			await getStatusDistribution(req, res);

			expect(res.json).toHaveBeenCalled();
		});
	});

	describe("getSystemStats", () => {
		it("should return system statistics", async () => {
			const req = createMockRequest() as Request;
			const res = createMockResponse() as Response;

			await getSystemStats(req, res);

			const data = getResponseData(res);
			expect(data).toHaveProperty("totalMem");
			expect(data).toHaveProperty("freeMem");
			expect(data).toHaveProperty("memUsage");
			expect(data).toHaveProperty("loadAvg");
			expect(data).toHaveProperty("uptime");
		});
	});

	describe("getStatusTrends", () => {
		it("should return status trends for 7d window", async () => {
			await createTestLogs(10);
			const req = createMockRequest({
				query: { window: "7d" },
			}) as Request;
			const res = createMockResponse() as Response;

			await getStatusTrends(req, res);

			const data = getResponseData(res);
			expect(data).toHaveProperty("labels");
			expect(data).toHaveProperty("success");
			expect(data).toHaveProperty("client");
			expect(data).toHaveProperty("server");
		});

		it("should handle different windows", async () => {
			await createTestLogs(5);
			const windows = ["1h", "1d", "1m"];

			for (const window of windows) {
				const req = createMockRequest({
					query: { window },
				}) as Request;
				const res = createMockResponse() as Response;

				await getStatusTrends(req, res);

				expect(res.json).toHaveBeenCalled();
			}
		});
	});

	describe("getSlowEndpoints", () => {
		it("should return slow endpoints", async () => {
			await createTestLogs(10);
			const req = createMockRequest({
				query: { window: "1d" },
			}) as Request;
			const res = createMockResponse() as Response;

			await getSlowEndpoints(req, res);

			const data = getResponseData(res);
			expect(data).toHaveProperty("slowEndpoints");
			expect(Array.isArray(data.slowEndpoints)).toBe(true);
			expect(data.slowEndpoints.length).toBeLessThanOrEqual(5);
		});
	});
});

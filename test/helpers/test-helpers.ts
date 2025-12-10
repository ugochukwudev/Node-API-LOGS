import { Request, Response } from "express";
import mongoose from "mongoose";
import ApiLog from "../../src/models/apilogs.model";

/**
 * Create a mock Express request object
 */
export const createMockRequest = (
	overrides: Partial<Request> = {}
): Partial<Request> => {
	return {
		query: {},
		params: {},
		body: {},
		...overrides,
	} as Partial<Request>;
};

/**
 * Create a mock Express response object
 */
export const createMockResponse = (): Partial<Response> => {
	const res: Partial<Response> = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
		send: jest.fn().mockReturnThis(),
	};
	return res;
};

/**
 * Create test API log entries
 */
export const createTestLogs = async (count: number = 5) => {
	const logs = [];
	const now = new Date();

	for (let i = 0; i < count; i++) {
		const log = new ApiLog({
			method: ["GET", "POST", "PUT", "DELETE"][i % 4],
			endpoint: `/api/test/${i}`,
			status: [200, 201, 400, 404, 500][i % 5],
			responseTime: Math.random() * 1000,
			requestBody: { test: `data${i}` },
			responseBody: { result: `result${i}` },
			headers: { "Content-Type": "application/json" },
			ip: `127.0.0.${i}`,
			date: new Date(now.getTime() - i * 60 * 60 * 1000), // Spread over hours
		});
		logs.push(log);
	}

	return await ApiLog.insertMany(logs);
};

/**
 * Wait for async operations
 */
export const wait = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get response data from mocked response
 */
export const getResponseData = (res: Partial<Response>): any => {
	const jsonCall = (res.json as jest.Mock).mock.calls[0];
	return jsonCall ? jsonCall[0] : null;
};

/**
 * Get status code from mocked response
 */
export const getStatusCode = (res: Partial<Response>): number | undefined => {
	const statusCall = (res.status as jest.Mock).mock.calls[0];
	return statusCall ? statusCall[0] : undefined;
};

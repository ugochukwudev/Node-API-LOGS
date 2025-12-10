/**
 * @jest-environment node
 */
import { Response } from "express";
import {
	handleTimeoutError,
	handleError,
} from "../../src/utils/error-handlers";
import { createMockResponse } from "../helpers/test-helpers";

// Error handlers don't need database
process.env.TEST_NEEDS_DB = "false";

describe("Error Handlers", () => {
	// Mock console methods
	beforeAll(() => {
		jest.spyOn(console, "error").mockImplementation();
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	describe("handleTimeoutError", () => {
		it("should handle MaxTimeMSExpired error", () => {
			const res = createMockResponse() as Response;
			const error = { code: 50, codeName: "MaxTimeMSExpired" };

			const handled = handleTimeoutError(error, res);

			expect(handled).toBe(true);
			expect(res.status).toHaveBeenCalledWith(504);
			expect(res.json).toHaveBeenCalled();
		});

		it("should return false for non-timeout errors", () => {
			const res = createMockResponse() as Response;
			const error = { code: 11000, message: "Duplicate key" };

			const handled = handleTimeoutError(error, res);

			expect(handled).toBe(false);
			expect(res.status).not.toHaveBeenCalled();
		});
	});

	describe("handleError", () => {
		it("should handle timeout errors", () => {
			const res = createMockResponse() as Response;
			const error = { code: 50, codeName: "MaxTimeMSExpired" };

			handleError(error, res, "testContext");

			expect(res.status).toHaveBeenCalledWith(504);
		});

		it("should handle general errors", () => {
			const res = createMockResponse() as Response;
			const error = { message: "General error" };

			handleError(error, res, "testContext");

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({
				message: "Server error: General error",
			});
		});

		it("should handle errors without message", () => {
			const res = createMockResponse() as Response;
			const error = "String error";

			handleError(error, res, "testContext");

			expect(res.status).toHaveBeenCalledWith(500);
		});
	});
});

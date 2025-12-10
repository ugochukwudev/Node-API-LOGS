import {
	TIME_WINDOWS,
	getStartDateFromWindow,
	getStartDateFromTimeRange,
	buildEndpointFilter,
	buildDateFilter,
	buildStatusFilter,
	buildFilters,
	hasRegexEndpoint,
	estimateTotalCount,
	buildDateLabels,
	getPaginationLimits,
} from "../../src/utils/query-helpers";

describe("Query Helpers", () => {
	describe("TIME_WINDOWS", () => {
		it("should have correct time window values", () => {
			expect(TIME_WINDOWS["1h"]).toBe(1000 * 60 * 60);
			expect(TIME_WINDOWS["1d"]).toBe(1000 * 60 * 60 * 24);
			expect(TIME_WINDOWS["7d"]).toBe(1000 * 60 * 60 * 24 * 7);
			expect(TIME_WINDOWS["1y"]).toBe(1000 * 60 * 60 * 24 * 365);
		});
	});

	describe("getStartDateFromWindow", () => {
		it("should calculate start date for valid window", () => {
			const start = getStartDateFromWindow("1d");
			const now = Date.now();
			const diff = now - start.getTime();
			expect(diff).toBeGreaterThanOrEqual(TIME_WINDOWS["1d"] - 1000);
			expect(diff).toBeLessThanOrEqual(TIME_WINDOWS["1d"] + 1000);
		});

		it("should use default window for invalid input", () => {
			const start = getStartDateFromWindow("invalid", "7d");
			const now = Date.now();
			const diff = now - start.getTime();
			expect(diff).toBeGreaterThanOrEqual(TIME_WINDOWS["7d"] - 1000);
		});
	});

	describe("getStartDateFromTimeRange", () => {
		it("should calculate start date for 1h", () => {
			const start = getStartDateFromTimeRange("1h");
			const now = new Date();
			const expected = new Date();
			expected.setHours(expected.getHours() - 1);
			expect(start.getTime()).toBeCloseTo(expected.getTime(), -3);
		});

		it("should calculate start date for 24h", () => {
			const start = getStartDateFromTimeRange("24h");
			const now = new Date();
			const expected = new Date();
			expected.setHours(expected.getHours() - 24);
			expect(start.getTime()).toBeCloseTo(expected.getTime(), -3);
		});

		it("should use default 24h for invalid range", () => {
			const start = getStartDateFromTimeRange("invalid");
			const expected = new Date();
			expected.setHours(expected.getHours() - 24);
			expect(start.getTime()).toBeCloseTo(expected.getTime(), -3);
		});
	});

	describe("buildEndpointFilter", () => {
		it("should return empty object for invalid endpoint", () => {
			expect(buildEndpointFilter(null)).toEqual({});
			expect(buildEndpointFilter("")).toEqual({});
			expect(buildEndpointFilter("ab")).toEqual({});
			expect(buildEndpointFilter(123)).toEqual({});
		});

		it("should build regex filter for valid endpoint", () => {
			const filter = buildEndpointFilter("api/users");
			expect(filter).toHaveProperty("endpoint");
			if ("endpoint" in filter) {
				expect(filter.endpoint).toHaveProperty("$regex");
				expect(filter.endpoint).toHaveProperty("$options", "i");
				expect(filter.endpoint.$regex).toMatch(/^\^api/);
				expect(filter.endpoint.$regex).toContain("users");
			}
		});

		it("should escape special regex characters", () => {
			const filter = buildEndpointFilter("api/users?page=1");
			if ("endpoint" in filter) {
				expect(filter.endpoint.$regex).toContain("\\?");
			}
		});
	});

	describe("buildDateFilter", () => {
		it("should return empty object for invalid date", () => {
			expect(buildDateFilter(null)).toEqual({});
			expect(buildDateFilter("")).toEqual({});
		});

		it("should build date filter without time", () => {
			const date = "2024-01-15";
			const filter = buildDateFilter(date);
			expect(filter).toHaveProperty("date");
			if ("date" in filter) {
				expect(filter.date).toHaveProperty("$gte");
				expect(filter.date).toHaveProperty("$lt");
			}
		});

		it("should build date filter with time", () => {
			const date = "2024-01-15";
			const time = "14:30";
			const filter = buildDateFilter(date, time);
			expect(filter).toHaveProperty("date");
			if ("date" in filter) {
				expect(filter.date.$gte.getHours()).toBe(14);
				expect(filter.date.$gte.getMinutes()).toBe(30);
			}
		});
	});

	describe("buildStatusFilter", () => {
		it("should return empty object for invalid status", () => {
			expect(buildStatusFilter(null)).toEqual({});
			expect(buildStatusFilter("")).toEqual({});
		});

		it("should build status filter for valid status", () => {
			const filter = buildStatusFilter("200");
			expect(filter).toEqual({ status: 200 });
		});
	});

	describe("buildFilters", () => {
		it("should build filters with default date", () => {
			const filters = buildFilters({ defaultDaysAgo: 7 });
			expect(filters).toHaveProperty("date");
			expect(filters.date).toHaveProperty("$gte");
		});

		it("should combine all filters", () => {
			const filters = buildFilters({
				endpoint: "api/test",
				date: "2024-01-15",
				status: "200",
				defaultDaysAgo: 30,
			});
			expect(filters).toHaveProperty("endpoint");
			expect(filters).toHaveProperty("date");
			expect(filters).toHaveProperty("status");
		});

		it("should override default date with specific date", () => {
			const filters = buildFilters({
				date: "2024-01-15",
				defaultDaysAgo: 30,
			});
			expect(filters.date).toHaveProperty("$lt");
		});
	});

	describe("hasRegexEndpoint", () => {
		it("should return false for invalid endpoint", () => {
			expect(hasRegexEndpoint(null)).toBe(false);
			expect(hasRegexEndpoint("")).toBe(false);
			expect(hasRegexEndpoint("ab")).toBe(false);
		});

		it("should return true for valid endpoint", () => {
			expect(hasRegexEndpoint("api/users")).toBe(true);
			expect(hasRegexEndpoint("  api  ")).toBe(true);
		});
	});

	describe("estimateTotalCount", () => {
		it("should estimate count when logs length equals limit", () => {
			const result = estimateTotalCount(20, 20, 1);
			expect(result).toBe(40); // (1 * 20) + 20
		});

		it("should return logs length when less than limit", () => {
			const result = estimateTotalCount(10, 20, 1);
			expect(result).toBe(10);
		});
	});

	describe("buildDateLabels", () => {
		it("should build hourly labels", () => {
			const labels = buildDateLabels("6h", TIME_WINDOWS["6h"]);
			expect(labels.length).toBeGreaterThan(0);
			expect(labels[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:00/);
		});

		it("should build daily labels", () => {
			const labels = buildDateLabels("7d", TIME_WINDOWS["7d"]);
			expect(labels.length).toBeGreaterThan(0);
			expect(labels[0]).toMatch(/\d{4}-\d{2}-\d{2}/);
		});
	});

	describe("getPaginationLimits", () => {
		it("should enforce max limits", () => {
			const { maxLimit, maxPage } = getPaginationLimits(200, 100);
			expect(maxLimit).toBe(50);
			expect(maxPage).toBe(100);
		});

		it("should use defaults for invalid input", () => {
			const { maxLimit, maxPage } = getPaginationLimits(null, null);
			expect(maxLimit).toBe(20);
			expect(maxPage).toBe(1);
		});

		it("should accept valid pagination", () => {
			const { maxLimit, maxPage } = getPaginationLimits(2, 10);
			expect(maxLimit).toBe(10);
			expect(maxPage).toBe(2);
		});
	});
});


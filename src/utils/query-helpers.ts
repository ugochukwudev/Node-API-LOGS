import { Request } from "express";

// Time window mappings (reusable across all controllers)
export const TIME_WINDOWS = {
	"1h": 1000 * 60 * 60,
	"6h": 1000 * 60 * 60 * 6,
	"12h": 1000 * 60 * 60 * 12,
	"1d": 1000 * 60 * 60 * 24,
	"7d": 1000 * 60 * 60 * 24 * 7,
	"1m": 1000 * 60 * 60 * 24 * 30,
	"3m": 1000 * 60 * 60 * 24 * 30 * 3,
	"6m": 1000 * 60 * 60 * 24 * 30 * 6,
	"1y": 1000 * 60 * 60 * 24 * 365,
} as const;

export type TimeWindow = keyof typeof TIME_WINDOWS;

/**
 * Calculate start date based on time window string
 */
export const getStartDateFromWindow = (window: string, defaultWindow: TimeWindow = "7d"): Date => {
	const diff = TIME_WINDOWS[window as TimeWindow] ?? TIME_WINDOWS[defaultWindow];
	return new Date(Date.now() - diff);
};

/**
 * Calculate start date for metrics time ranges (different format)
 */
export const getStartDateFromTimeRange = (timeRange: string): Date => {
	const startDate = new Date();
	switch (timeRange) {
		case "1h":
			startDate.setHours(startDate.getHours() - 1);
			break;
		case "24h":
			startDate.setHours(startDate.getHours() - 24);
			break;
		case "7d":
			startDate.setDate(startDate.getDate() - 7);
			break;
		case "30d":
			startDate.setDate(startDate.getDate() - 30);
			break;
		default:
			startDate.setHours(startDate.getHours() - 24);
	}
	return startDate;
};

/**
 * Build date filter from query params
 */
export const buildDateFilter = (date?: unknown, time?: unknown): { date: { $gte: Date; $lt?: Date } } | {} => {
	if (!date || typeof date !== "string") {
		return {};
	}

	const start = new Date(date);
	const end = new Date(start);
	end.setDate(end.getDate() + 1);

	// If time is provided, create more specific time range
	if (time && typeof time === "string") {
		const [hours, minutes] = time.split(":");
		const startTime = new Date(date);
		startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
		const endTime = new Date(startTime);
		endTime.setMinutes(endTime.getMinutes() + 59);
		return {
			date: { $gte: startTime, $lt: endTime },
		};
	}

	return {
		date: { $gte: start, $lt: end },
	};
};

/**
 * Calculate estimated total count when countDocuments is too expensive
 */
export const estimateTotalCount = (logsLength: number, maxLimit: number, maxPage: number): number => {
	return logsLength === maxLimit ? maxPage * maxLimit + maxLimit : logsLength;
};

/**
 * Build date labels for charts based on time window
 */
export const buildDateLabels = (window: string, diff: number): string[] => {
	const labels: string[] = [];
	const now = new Date();

	if (window.endsWith("h")) {
		// Hourly labels
		const hours = diff / (1000 * 60 * 60);
		for (let i = hours; i >= 0; i--) {
			const d = new Date(now.getTime() - i * 60 * 60 * 1000);
			labels.push(d.toISOString().slice(0, 13) + ":00");
		}
	} else {
		// Daily labels
		const days = diff / (1000 * 60 * 60 * 24);
		for (let i = days; i >= 0; i--) {
			const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
			labels.push(d.toISOString().split("T")[0]);
		}
	}

	return labels;
};

/**
 * Get pagination limits with safety constraints
 */
export const getPaginationLimits = (page: unknown, limit: unknown): { maxLimit: number; maxPage: number } => {
	return {
		maxLimit: Math.min(+(limit || 20), 50),
		maxPage: Math.min(+(page || 1), 100),
	};
};


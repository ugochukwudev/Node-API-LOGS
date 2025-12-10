import { Request, Response } from "express";
import ApiLog from "../models/apilogs.model";
import os from "os";
import {
	buildFilters,
	buildDateLabels,
	estimateTotalCount,
	getPaginationLimits,
	getStartDateFromTimeRange,
	getStartDateFromWindow,
	hasRegexEndpoint,
	TIME_WINDOWS,
} from "../utils/query-helpers";
import { handleError, handleTimeoutError } from "../utils/error-handlers";

export const getLogs = async (req: Request, res: Response) => {
	const { page, limit, endpoint, date, time, status } = req.query;

	try {
		const filters = buildFilters({
			endpoint,
			date,
			time,
			status,
			defaultDaysAgo: 30,
		});
		const { maxLimit, maxPage } = getPaginationLimits(page, limit);
		const regexEndpoint = hasRegexEndpoint(endpoint);

		const query = ApiLog.find(filters, {
			method: 1,
			endpoint: 1,
			status: 1,
			date: 1,
			responseTime: 1,
			_id: 1,
		})
			.lean()
			.skip((maxPage - 1) * maxLimit)
			.limit(maxLimit)
			.sort({ date: -1 })
			.maxTimeMS(10000);

		// Only use hint for non-regex queries
		if (!regexEndpoint) {
			query.hint(status ? { status: 1, date: -1 } : { date: -1 });
		}

		const logs = await query;

		// Skip countDocuments for regex queries to avoid high scan ratio
		let total: number;
		if (regexEndpoint) {
			total = estimateTotalCount(logs.length, maxLimit, maxPage);
			console.warn(
				"Skipping countDocuments for regex endpoint query to avoid high scan ratio"
			);
		} else {
			try {
				total = await ApiLog.countDocuments(filters).maxTimeMS(8000);
			} catch (countError: any) {
				if (
					countError.code === 50 ||
					countError.codeName === "MaxTimeMSExpired"
				) {
					console.warn("countDocuments timed out, using estimated count");
					total = estimateTotalCount(logs.length, maxLimit, maxPage);
				} else {
					throw countError;
				}
			}
		}

		res.json({ logs, total });
	} catch (error: any) {
		if (!handleTimeoutError(error, res)) {
			handleError(error, res, "getLogs");
		}
	}
};

export const getLogById = async (req: Request, res: Response) => {
	const { id } = req.params;

	try {
		const log = await ApiLog.findById(id);
		if (!log) return res.status(404).json({ message: "Log not found" });
		res.json({ log });
	} catch (error) {
		handleError(error, res, "getLogById");
	}
};

export const getMetrics = async (req: Request, res: Response) => {
	try {
		const timeRange = (req.query.timeRange as string) || "24h";
		const startDate = getStartDateFromTimeRange(timeRange);

		const [totalRequests, avgResult, slowEndpoints, errorCount] =
			await Promise.all([
				ApiLog.countDocuments({ date: { $gte: startDate } }).maxTimeMS(3000),
				ApiLog.aggregate([
					{ $match: { date: { $gte: startDate } } },
					{ $group: { _id: null, avgResponseTime: { $avg: "$responseTime" } } },
				])
					.option({ maxTimeMS: 3000 })
					.allowDiskUse(true),
				ApiLog.aggregate([
					{ $match: { date: { $gte: startDate } } },
					{
						$group: {
							_id: "$endpoint",
							avgTime: { $avg: "$responseTime" },
							count: { $sum: 1 },
						},
					},
					{ $match: { count: { $gte: 3 } } },
					{ $sort: { avgTime: -1 } },
					{ $limit: 5 },
				])
					.option({ maxTimeMS: 3000 })
					.allowDiskUse(true),
				ApiLog.countDocuments({
					date: { $gte: startDate },
					status: { $gte: 400 },
				}).maxTimeMS(3000),
			]);

		res.json({
			totalRequests,
			avgResponseTime: avgResult[0]?.avgResponseTime || 0,
			slowEndpoints,
			errorCount,
		});
	} catch (error) {
		handleError(error, res, "getMetrics");
	}
};

export const getStatusDistribution = async (req: Request, res: Response) => {
	try {
		const filters = buildFilters({
			endpoint: req.query.endpoint,
			date: req.query.date,
			time: req.query.time,
			status: req.query.status,
			defaultDaysAgo: 7,
		});

		const distribution = await ApiLog.aggregate([
			{ $match: filters },
			{ $group: { _id: "$status", count: { $sum: 1 } } },
			{ $sort: { _id: 1 } },
		])
			.option({ maxTimeMS: 3000 })
			.allowDiskUse(true);

		res.json({ distribution });
	} catch (error) {
		handleError(error, res, "getStatusDistribution");
	}
};

export const getSystemStats = async (req: Request, res: Response) => {
	try {
		const totalMem = os.totalmem();
		const freeMem = os.freemem();
		const usedMem = totalMem - freeMem;
		const memUsage = (usedMem / totalMem) * 100;
		const loadAvg = os.loadavg();
		const uptime = process.uptime();
		const procMem = process.memoryUsage();
		const procMemPercent = (procMem.rss / totalMem) * 100;

		res.json({
			totalMem,
			freeMem,
			usedMem,
			memUsage,
			loadAvg,
			uptime,
			procMem,
			procMemPercent,
		});
	} catch (error) {
		handleError(error, res, "getSystemStats");
	}
};

export const getStatusTrends = async (req: Request, res: Response) => {
	try {
		const win = (req.query.window as string) || "7d";
		const diff =
			TIME_WINDOWS[win as keyof typeof TIME_WINDOWS] ?? TIME_WINDOWS["7d"];
		const start = getStartDateFromWindow(win, "7d");

		const result = await ApiLog.aggregate([
			{ $match: { date: { $gte: start } } },
			{
				$project: {
					day: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
					status: 1,
				},
			},
			{
				$group: {
					_id: {
						day: "$day",
						cat: {
							$cond: [
								{ $lt: ["$status", 300] },
								"success",
								{ $cond: [{ $lt: ["$status", 500] }, "client", "server"] },
							],
						},
					},
					count: { $sum: 1 },
				},
			},
			{ $sort: { "_id.day": 1 } },
		])
			.option({ maxTimeMS: 5000 })
			.allowDiskUse(true);

		const labels = buildDateLabels(win, diff);

		interface Series {
			success: Record<string, number>;
			client: Record<string, number>;
			server: Record<string, number>;
		}

		const series: Series = {
			success: {},
			client: {},
			server: {},
		};

		labels.forEach((day) => {
			series.success[day] = 0;
			series.client[day] = 0;
			series.server[day] = 0;
		});

		interface TrendId {
			day: string;
			cat: string;
		}

		result.forEach((item) => {
			const id = item._id as TrendId;
			const catKey = id.cat as keyof Series;
			series[catKey][id.day] = item.count;
		});

		res.json({
			labels,
			success: labels.map((d) => series.success[d]),
			client: labels.map((d) => series.client[d]),
			server: labels.map((d) => series.server[d]),
		});
	} catch (error) {
		handleError(error, res, "getStatusTrends");
	}
};

export const getSlowEndpoints = async (req: Request, res: Response) => {
	try {
		const win = (req.query.window as string) || "1d";
		const start = getStartDateFromWindow(win, "1d");

		const slowEndpoints = await ApiLog.aggregate([
			{ $match: { date: { $gte: start } } },
			{
				$group: {
					_id: "$endpoint",
					avgTime: { $avg: "$responseTime" },
					count: { $sum: 1 },
				},
			},
			{ $sort: { avgTime: -1 } },
			{ $limit: 5 },
		])
			.option({ maxTimeMS: 5000 })
			.allowDiskUse(true);

		res.json({ slowEndpoints });
	} catch (error) {
		handleError(error, res, "getSlowEndpoints");
	}
};

import { Request, Response } from "express";
import ApiLog from "../models/apilogs.model";
import LogSummary from "../models/logsummary.model";
import os from "os";
import {
	buildDateFilter,
	buildDateLabels,
	estimateTotalCount,
	getPaginationLimits,
	getStartDateFromTimeRange,
	getStartDateFromWindow,
	TIME_WINDOWS,
} from "../utils/query-helpers";
import { handleError, handleTimeoutError } from "../utils/error-handlers";
import { hydrateLog } from "../core/blobs";
import { buildLogQuery, escapeRegex, LogSearchParams, parseSearchParams, SearchError } from "../core/search";
import { deleteLogs, deleteSummaries, statsSource } from "../core/retention";
import {
	EXPORT_CONTENT_TYPES,
	EXPORT_FORMATS,
	ExportFormat,
	exportFileName,
	exportLogs,
	ExportUnavailableError,
	loadSqlite,
} from "../core/export";

/** Search params from the query string; the v2 `date` + `time` params still work. */
const searchParamsFrom = (query: Request["query"]): LogSearchParams => {
	const params = parseSearchParams(query as Record<string, unknown>);
	if (!params.from && typeof query.date === "string") {
		const legacy = buildDateFilter(query.date, query.time) as { date?: { $gte: Date; $lt?: Date } };
		if (legacy.date) {
			params.from = legacy.date.$gte.toISOString();
			if (legacy.date.$lt) params.to = legacy.date.$lt.toISOString();
		}
	}
	return params;
};

const handleSearchError = (error: unknown, res: Response, context: string) => {
	if (error instanceof SearchError) return res.status(400).json({ message: error.message });
	if (!handleTimeoutError(error, res)) handleError(error, res, context);
};

export const getLogs = async (req: Request, res: Response) => {
	const { page, limit } = req.query;

	try {
		const { filter, usesText } = await buildLogQuery(searchParamsFrom(req.query));
		const { maxLimit, maxPage } = getPaginationLimits(page, limit);

		const logs = await ApiLog.find(filter, {
			method: 1,
			endpoint: 1,
			status: 1,
			date: 1,
			responseTime: 1,
			ip: 1,
			_id: 1,
		})
			.lean()
			.skip((maxPage - 1) * maxLimit)
			.limit(maxLimit)
			.sort({ date: -1 })
			.maxTimeMS(10000);

		// Exact counts are skipped for text searches, which can't use an index.
		let total: number;
		let estimated = false;
		if (usesText) {
			total = estimateTotalCount(logs.length, maxLimit, maxPage);
			estimated = true;
		} else {
			try {
				total = await ApiLog.countDocuments(filter).maxTimeMS(8000);
			} catch (countError: any) {
				if (countError.code === 50 || countError.codeName === "MaxTimeMSExpired") {
					total = estimateTotalCount(logs.length, maxLimit, maxPage);
					estimated = true;
				} else {
					throw countError;
				}
			}
		}

		res.json({ logs, total, estimated });
	} catch (error) {
		handleSearchError(error, res, "getLogs");
	}
};

export const getLogById = async (req: Request, res: Response) => {
	const { id } = req.params;

	try {
		const log = await ApiLog.findById(id).lean();
		if (!log) return res.status(404).json({ message: "Log not found" });
		res.json({ log: await hydrateLog(log) });
	} catch (error) {
		handleError(error, res, "getLogById");
	}
};

// All chart endpoints read logs AND the hourly summaries kept from deleted logs.
export const getMetrics = async (req: Request, res: Response) => {
	try {
		const timeRange = (req.query.timeRange as string) || "24h";
		const startDate = getStartDateFromTimeRange(timeRange);

		const [result] = await ApiLog.aggregate([
			...statsSource(startDate),
			{
				$facet: {
					totals: [
						{
							$group: {
								_id: null,
								totalRequests: { $sum: "$n" },
								totalTime: { $sum: "$t" },
								errorCount: { $sum: { $cond: [{ $gte: ["$status", 400] }, "$n", 0] } },
							},
						},
					],
					slowEndpoints: [
						{ $group: { _id: "$endpoint", totalTime: { $sum: "$t" }, count: { $sum: "$n" } } },
						{ $match: { count: { $gte: 3 } } },
						{ $project: { avgTime: { $divide: ["$totalTime", "$count"] }, count: 1 } },
						{ $sort: { avgTime: -1 } },
						{ $limit: 5 },
					],
				},
			},
		])
			.option({ maxTimeMS: 5000 })
			.allowDiskUse(true);

		const totals = result?.totals[0] || { totalRequests: 0, totalTime: 0, errorCount: 0 };
		res.json({
			totalRequests: totals.totalRequests,
			avgResponseTime: totals.totalRequests ? totals.totalTime / totals.totalRequests : 0,
			slowEndpoints: result?.slowEndpoints || [],
			errorCount: totals.errorCount,
		});
	} catch (error) {
		handleError(error, res, "getMetrics");
	}
};

export const getStatusDistribution = async (req: Request, res: Response) => {
	try {
		const from = typeof req.query.from === "string" && !isNaN(Date.parse(req.query.from))
			? new Date(req.query.from)
			: getStartDateFromWindow("7d");
		const endpoint = typeof req.query.endpoint === "string" ? req.query.endpoint.trim() : "";

		const distribution = await ApiLog.aggregate([
			...statsSource(from),
			...(endpoint ? [{ $match: { endpoint: { $regex: escapeRegex(endpoint), $options: "i" } } }] : []),
			{ $group: { _id: "$status", count: { $sum: "$n" } } },
			{ $sort: { _id: 1 } },
		])
			.option({ maxTimeMS: 5000 })
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
		const diff = TIME_WINDOWS[win as keyof typeof TIME_WINDOWS] ?? TIME_WINDOWS["7d"];
		const start = getStartDateFromWindow(win, "7d");
		const hourly = win.endsWith("h");

		const result = await ApiLog.aggregate([
			...statsSource(start),
			{
				$group: {
					_id: {
						bucket: { $dateToString: { format: hourly ? "%Y-%m-%dT%H:00" : "%Y-%m-%d", date: "$date" } },
						cat: {
							$cond: [
								{ $lt: ["$status", 400] },
								"success",
								{ $cond: [{ $lt: ["$status", 500] }, "client", "server"] },
							],
						},
					},
					count: { $sum: "$n" },
				},
			},
		])
			.option({ maxTimeMS: 5000 })
			.allowDiskUse(true);

		const labels = buildDateLabels(win, diff);
		const series = {
			success: {} as Record<string, number>,
			client: {} as Record<string, number>,
			server: {} as Record<string, number>,
		};
		labels.forEach((label) => {
			series.success[label] = 0;
			series.client[label] = 0;
			series.server[label] = 0;
		});
		result.forEach((item) => {
			const { bucket, cat } = item._id as { bucket: string; cat: keyof typeof series };
			if (bucket in series[cat]) series[cat][bucket] = item.count;
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
			...statsSource(start),
			{ $group: { _id: "$endpoint", totalTime: { $sum: "$t" }, count: { $sum: "$n" } } },
			{ $project: { avgTime: { $divide: ["$totalTime", "$count"] }, count: 1 } },
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

export const getExportFormats = (req: Request, res: Response) => {
	res.json({
		formats: EXPORT_FORMATS.map((format) => ({
			format,
			available: format !== "sqlite" || !!loadSqlite(),
		})),
	});
};

/** Download matching logs. Uses the same filters as the logs list. */
export const exportLogsHandler = async (req: Request, res: Response) => {
	const format = String(req.query.format || "csv") as ExportFormat;
	if (!EXPORT_FORMATS.includes(format)) {
		return res.status(400).json({ message: `Format must be one of: ${EXPORT_FORMATS.join(", ")}` });
	}

	try {
		const { filter } = await buildLogQuery(searchParamsFrom(req.query));
		if (format === "sqlite" && !loadSqlite()) {
			throw new ExportUnavailableError("SQLite export needs Node.js 22.5 or newer. Use CSV or JSON Lines instead.");
		}
		res.setHeader("Content-Type", EXPORT_CONTENT_TYPES[format]);
		res.setHeader("Content-Disposition", `attachment; filename="${exportFileName(format)}"`);
		await exportLogs(format, filter, res);
		res.end();
	} catch (error) {
		if (res.headersSent) {
			// Mid-stream failure: cut the download so it isn't mistaken for a complete file.
			res.destroy(error as Error);
			return;
		}
		if (error instanceof ExportUnavailableError) return res.status(501).json({ message: error.message });
		handleSearchError(error, res, "exportLogs");
	}
};

/** Admin: delete logs matching the filters (summaries are kept). Requires a `to` date or explicit filters. */
export const deleteLogsHandler = async (req: Request, res: Response) => {
	try {
		const params = parseSearchParams(req.body || {});
		const hasFilter = Object.keys(params).length > 0;
		if (!hasFilter && req.body?.all !== true) {
			return res.status(400).json({ message: "Choose what to delete (for example a date range), or send all: true" });
		}
		// Deleting has no implicit 30-day window: from defaults to the beginning.
		const { filter } = await buildLogQuery({ from: new Date(0).toISOString(), ...params });
		const result = await deleteLogs(filter);
		res.json(result);
	} catch (error) {
		handleSearchError(error, res, "deleteLogs");
	}
};

export const getSummariesInfo = async (req: Request, res: Response) => {
	try {
		const [count, oldest] = await Promise.all([
			LogSummary.estimatedDocumentCount(),
			LogSummary.findOne({}, { hour: 1 }).sort({ hour: 1 }).lean(),
		]);
		res.json({ count, oldest: oldest?.hour || null });
	} catch (error) {
		handleError(error, res, "getSummariesInfo");
	}
};

/** Admin: delete hourly summaries, all or those before `before`. */
export const deleteSummariesHandler = async (req: Request, res: Response) => {
	try {
		const before = req.body?.before ? new Date(req.body.before) : undefined;
		if (before && isNaN(before.getTime())) return res.status(400).json({ message: "Invalid date" });
		res.json({ deleted: await deleteSummaries(before) });
	} catch (error) {
		handleError(error, res, "deleteSummaries");
	}
};

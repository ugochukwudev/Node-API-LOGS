"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSlowEndpoints = exports.getStatusTrends = exports.getSystemStats = exports.getStatusDistribution = exports.getMetrics = exports.getLogById = exports.getLogs = void 0;
const apilogs_model_1 = __importDefault(require("../models/apilogs.model"));
const os_1 = __importDefault(require("os"));
const query_helpers_1 = require("../utils/query-helpers");
const error_handlers_1 = require("../utils/error-handlers");
const getLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page, limit, endpoint, date, time, status } = req.query;
    try {
        const filters = (0, query_helpers_1.buildFilters)({
            endpoint,
            date,
            time,
            status,
            defaultDaysAgo: 30,
        });
        const { maxLimit, maxPage } = (0, query_helpers_1.getPaginationLimits)(page, limit);
        const regexEndpoint = (0, query_helpers_1.hasRegexEndpoint)(endpoint);
        const query = apilogs_model_1.default.find(filters, {
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
        const logs = yield query;
        // Skip countDocuments for regex queries to avoid high scan ratio
        let total;
        if (regexEndpoint) {
            total = (0, query_helpers_1.estimateTotalCount)(logs.length, maxLimit, maxPage);
            console.warn("Skipping countDocuments for regex endpoint query to avoid high scan ratio");
        }
        else {
            try {
                total = yield apilogs_model_1.default.countDocuments(filters).maxTimeMS(8000);
            }
            catch (countError) {
                if (countError.code === 50 ||
                    countError.codeName === "MaxTimeMSExpired") {
                    console.warn("countDocuments timed out, using estimated count");
                    total = (0, query_helpers_1.estimateTotalCount)(logs.length, maxLimit, maxPage);
                }
                else {
                    throw countError;
                }
            }
        }
        res.json({ logs, total });
    }
    catch (error) {
        if (!(0, error_handlers_1.handleTimeoutError)(error, res)) {
            (0, error_handlers_1.handleError)(error, res, "getLogs");
        }
    }
});
exports.getLogs = getLogs;
const getLogById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const log = yield apilogs_model_1.default.findById(id);
        if (!log)
            return res.status(404).json({ message: "Log not found" });
        res.json({ log });
    }
    catch (error) {
        (0, error_handlers_1.handleError)(error, res, "getLogById");
    }
});
exports.getLogById = getLogById;
const getMetrics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const timeRange = req.query.timeRange || "24h";
        const startDate = (0, query_helpers_1.getStartDateFromTimeRange)(timeRange);
        const [totalRequests, avgResult, slowEndpoints, errorCount] = yield Promise.all([
            apilogs_model_1.default.countDocuments({ date: { $gte: startDate } }).maxTimeMS(3000),
            apilogs_model_1.default.aggregate([
                { $match: { date: { $gte: startDate } } },
                { $group: { _id: null, avgResponseTime: { $avg: "$responseTime" } } },
            ])
                .option({ maxTimeMS: 3000 })
                .allowDiskUse(true),
            apilogs_model_1.default.aggregate([
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
            apilogs_model_1.default.countDocuments({
                date: { $gte: startDate },
                status: { $gte: 400 },
            }).maxTimeMS(3000),
        ]);
        res.json({
            totalRequests,
            avgResponseTime: ((_a = avgResult[0]) === null || _a === void 0 ? void 0 : _a.avgResponseTime) || 0,
            slowEndpoints,
            errorCount,
        });
    }
    catch (error) {
        (0, error_handlers_1.handleError)(error, res, "getMetrics");
    }
});
exports.getMetrics = getMetrics;
const getStatusDistribution = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const filters = (0, query_helpers_1.buildFilters)({
            endpoint: req.query.endpoint,
            date: req.query.date,
            time: req.query.time,
            status: req.query.status,
            defaultDaysAgo: 7,
        });
        const distribution = yield apilogs_model_1.default.aggregate([
            { $match: filters },
            { $group: { _id: "$status", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ])
            .option({ maxTimeMS: 3000 })
            .allowDiskUse(true);
        res.json({ distribution });
    }
    catch (error) {
        (0, error_handlers_1.handleError)(error, res, "getStatusDistribution");
    }
});
exports.getStatusDistribution = getStatusDistribution;
const getSystemStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const totalMem = os_1.default.totalmem();
        const freeMem = os_1.default.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = (usedMem / totalMem) * 100;
        const loadAvg = os_1.default.loadavg();
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
    }
    catch (error) {
        (0, error_handlers_1.handleError)(error, res, "getSystemStats");
    }
});
exports.getSystemStats = getSystemStats;
const getStatusTrends = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const win = req.query.window || "7d";
        const diff = (_a = query_helpers_1.TIME_WINDOWS[win]) !== null && _a !== void 0 ? _a : query_helpers_1.TIME_WINDOWS["7d"];
        const start = (0, query_helpers_1.getStartDateFromWindow)(win, "7d");
        const result = yield apilogs_model_1.default.aggregate([
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
        const labels = (0, query_helpers_1.buildDateLabels)(win, diff);
        const series = {
            success: {},
            client: {},
            server: {},
        };
        labels.forEach((day) => {
            series.success[day] = 0;
            series.client[day] = 0;
            series.server[day] = 0;
        });
        result.forEach((item) => {
            const id = item._id;
            const catKey = id.cat;
            series[catKey][id.day] = item.count;
        });
        res.json({
            labels,
            success: labels.map((d) => series.success[d]),
            client: labels.map((d) => series.client[d]),
            server: labels.map((d) => series.server[d]),
        });
    }
    catch (error) {
        (0, error_handlers_1.handleError)(error, res, "getStatusTrends");
    }
});
exports.getStatusTrends = getStatusTrends;
const getSlowEndpoints = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const win = req.query.window || "1d";
        const start = (0, query_helpers_1.getStartDateFromWindow)(win, "1d");
        const slowEndpoints = yield apilogs_model_1.default.aggregate([
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
    }
    catch (error) {
        (0, error_handlers_1.handleError)(error, res, "getSlowEndpoints");
    }
});
exports.getSlowEndpoints = getSlowEndpoints;
//# sourceMappingURL=api.js.map
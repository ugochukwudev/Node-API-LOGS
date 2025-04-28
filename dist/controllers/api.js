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
const getLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page = 1, limit = 10, endpoint, date, time, status } = req.query;
    const filters = {};
    //@ts-ignore
    if (endpoint && endpoint.length > 1) {
        filters.endpoint = { $regex: endpoint, $options: 'i' }; // Case-insensitive search
    }
    if (date) {
        const start = new Date(date);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filters.date = { $gte: start, $lt: end };
    }
    if (time && date) {
        const [hours, minutes] = time.split(':');
        const startTime = new Date(date);
        startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 59); // Adjust as needed
        filters.date = { $gte: startTime, $lt: endTime };
    }
    if (status) {
        filters.status = parseInt(status);
    }
    try {
        const logs = yield apilogs_model_1.default.find(filters)
            .skip((+page - 1) * +limit)
            .limit(+limit)
            .sort({ date: -1 });
        const total = yield apilogs_model_1.default.countDocuments(filters);
        res.json({ logs, total });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' + error });
    }
});
exports.getLogs = getLogs;
const getLogById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const log = yield apilogs_model_1.default.findById(id);
        if (!log)
            return res.status(404).json({ message: 'Log not found' });
        res.json({ log });
    }
    catch (error) {
        res.status(500).json({ message: `Server error:${error}` });
    }
});
exports.getLogById = getLogById;
const getMetrics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Total number of requests
        const totalRequests = yield apilogs_model_1.default.countDocuments();
        // Average response time across all requests
        const avgResult = yield apilogs_model_1.default.aggregate([
            { $group: { _id: null, avgResponseTime: { $avg: '$responseTime' } } }
        ]);
        const avgResponseTime = ((_a = avgResult[0]) === null || _a === void 0 ? void 0 : _a.avgResponseTime) || 0;
        // Top 5 slowest endpoints by average response time
        const slowEndpoints = yield apilogs_model_1.default.aggregate([
            { $group: { _id: '$endpoint', avgTime: { $avg: '$responseTime' }, count: { $sum: 1 } } },
            { $sort: { avgTime: -1 } },
            { $limit: 5 }
        ]);
        // Count of error requests (status >= 400)
        const errorCount = yield apilogs_model_1.default.countDocuments({ status: { $gte: 400 } });
        res.json({ totalRequests, avgResponseTime, slowEndpoints, errorCount });
    }
    catch (error) {
        res.status(500).json({ message: 'Error computing metrics', error });
    }
});
exports.getMetrics = getMetrics;
// Controller: Distribution of requests by status code
const getStatusDistribution = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Apply same filters as getLogs
    const { endpoint, date, time, status } = req.query;
    const filters = {};
    if (endpoint && typeof endpoint === 'string' && endpoint.length > 1) {
        filters.endpoint = { $regex: endpoint, $options: 'i' };
    }
    if (date && typeof date === 'string') {
        const start = new Date(date);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filters.date = { $gte: start, $lt: end };
    }
    if (time && typeof time === 'string' && date) {
        const [hours, minutes] = time.split(':');
        const startTime = new Date(date);
        startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 59);
        filters.date = { $gte: startTime, $lt: endTime };
    }
    if (status && typeof status === 'string') {
        filters.status = parseInt(status, 10);
    }
    try {
        const distribution = yield apilogs_model_1.default.aggregate([
            { $match: filters },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        res.json({ distribution });
    }
    catch (error) {
        res.status(500).json({ message: 'Error computing distribution', error });
    }
});
exports.getStatusDistribution = getStatusDistribution;
// Controller: System resource statistics
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
        res.json({ totalMem, freeMem, usedMem, memUsage, loadAvg, uptime, procMem, procMemPercent });
    }
    catch (error) {
        res.status(500).json({ message: 'Error computing system stats', error });
    }
});
exports.getSystemStats = getSystemStats;
// Controller: Status code trends over last 7 days
const getStatusTrends = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Determine time window from query param (default 7 days)
        const win = req.query.window || '7d';
        const mapWindow = {
            '1h': 1000 * 60 * 60,
            '6h': 1000 * 60 * 60 * 6,
            '12h': 1000 * 60 * 60 * 12,
            '1d': 1000 * 60 * 60 * 24,
            '7d': 1000 * 60 * 60 * 24 * 7,
            '1m': 1000 * 60 * 60 * 24 * 30,
            '3m': 1000 * 60 * 60 * 24 * 30 * 3,
            '6m': 1000 * 60 * 60 * 24 * 30 * 6,
            '1y': 1000 * 60 * 60 * 24 * 365
        };
        const now = new Date();
        const diff = (_a = mapWindow[win]) !== null && _a !== void 0 ? _a : mapWindow['7d'];
        const start = new Date(now.getTime() - diff);
        // Aggregate by day and status category
        const result = yield apilogs_model_1.default.aggregate([
            { $match: { date: { $gte: start } } },
            {
                $project: {
                    day: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                    status: 1
                }
            },
            {
                $group: {
                    _id: { day: "$day", cat: { $cond: [{ $lt: ["$status", 300] }, "success", { $cond: [{ $lt: ["$status", 500] }, "client", "server"] }] } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.day": 1 } }
        ]);
        // Build date labels based on window
        const labels = [];
        // Determine number of units (days or hours)
        if (win.endsWith('h')) {
            // Hourly labels
            const hours = diff / (1000 * 60 * 60);
            for (let i = hours; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 60 * 60 * 1000);
                labels.push(d.toISOString().slice(0, 13) + ':00');
            }
        }
        else {
            // Daily labels
            const days = diff / (1000 * 60 * 60 * 24);
            for (let i = days; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                labels.push(d.toISOString().split('T')[0]);
            }
        }
        // Initialize series
        const series = {
            success: {},
            client: {},
            server: {}
        };
        labels.forEach(day => {
            series.success[day] = 0;
            series.client[day] = 0;
            series.server[day] = 0;
        });
        result.forEach(item => {
            const id = item._id;
            const dayKey = id.day;
            // Cast category to a key of Series
            const catKey = id.cat;
            series[catKey][dayKey] = item.count;
        });
        res.json({ labels, success: labels.map(d => series.success[d]), client: labels.map(d => series.client[d]), server: labels.map(d => series.server[d]) });
    }
    catch (error) {
        res.status(500).json({ message: 'Error computing status trends', error });
    }
});
exports.getStatusTrends = getStatusTrends;
// Controller: Top slowest endpoints within a given time window
const getSlowEndpoints = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const win = req.query.window || '1d';
        // Determine milliseconds to subtract for each window
        const map = {
            '1h': 1000 * 60 * 60,
            '6h': 1000 * 60 * 60 * 6,
            '12h': 1000 * 60 * 60 * 12,
            '1d': 1000 * 60 * 60 * 24,
            '7d': 1000 * 60 * 60 * 24 * 7,
            '1m': 1000 * 60 * 60 * 24 * 30,
            '3m': 1000 * 60 * 60 * 24 * 30 * 3,
            '6m': 1000 * 60 * 60 * 24 * 30 * 6,
            '1y': 1000 * 60 * 60 * 24 * 365,
        };
        const diff = map[win] || map['1d'];
        const start = new Date(Date.now() - diff);
        const slowEndpoints = yield apilogs_model_1.default.aggregate([
            { $match: { date: { $gte: start } } },
            { $group: { _id: '$endpoint', avgTime: { $avg: '$responseTime' }, count: { $sum: 1 } } },
            { $sort: { avgTime: -1 } },
            { $limit: 5 }
        ]);
        res.json({ slowEndpoints });
    }
    catch (error) {
        res.status(500).json({ message: 'Error computing slow endpoints', error });
    }
});
exports.getSlowEndpoints = getSlowEndpoints;
//# sourceMappingURL=api.js.map
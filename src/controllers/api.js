"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSlowEndpoints = exports.getStatusTrends = exports.getSystemStats = exports.getStatusDistribution = exports.getMetrics = exports.getLogById = exports.getLogs = void 0;
const apilogs_model_1 = __importDefault(require("../models/apilogs.model"));
const os_1 = __importDefault(require("os"));
const getLogs = async (req, res) => {
    const { page = 1, limit = 20, endpoint, date, time, status } = req.query;
    const filters = {};
    // Add default date filter to limit results (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    filters.date = { $gte: thirtyDaysAgo };
    // Optimize endpoint search - only if provided and meaningful
    if (endpoint && typeof endpoint === 'string' && endpoint.trim().length > 2) {
        filters.endpoint = { $regex: endpoint.trim(), $options: 'i' };
    }
    // Date filtering
    if (date && typeof date === 'string') {
        const start = new Date(date);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filters.date = { $gte: start, $lt: end };
    }
    // Time filtering (only if date is also provided)
    if (time && date && typeof time === 'string' && typeof date === 'string') {
        const [hours, minutes] = time.split(':');
        const startTime = new Date(date);
        startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 59);
        filters.date = { $gte: startTime, $lt: endTime };
    }
    // Status filtering
    if (status && typeof status === 'string') {
        filters.status = parseInt(status);
    }
    try {
        // Strict limits for performance
        const maxLimit = Math.min(+limit, 50);
        const maxPage = Math.min(+page, 100); // Prevent deep pagination
        // Use lean() for better performance and projection
        const logs = await apilogs_model_1.default.find(filters, {
            method: 1,
            endpoint: 1,
            status: 1,
            date: 1,
            responseTime: 1,
            _id: 1
        })
            .lean() // Use lean for better performance
            .skip((maxPage - 1) * maxLimit)
            .limit(maxLimit)
            .sort({ date: -1 })
            .hint({ date: -1 }); // Force index usage
        // Get total count with same filters but limit for performance
        const total = await apilogs_model_1.default.countDocuments(filters).maxTimeMS(5000); // 5 second timeout
        res.json({ logs, total });
    }
    catch (error) {
        console.error('getLogs error:', error);
        res.status(500).json({ message: 'Server error: ' + error });
    }
};
exports.getLogs = getLogs;
const getLogById = async (req, res) => {
    const { id } = req.params;
    try {
        const log = await apilogs_model_1.default.findById(id);
        if (!log)
            return res.status(404).json({ message: 'Log not found' });
        res.json({ log });
    }
    catch (error) {
        res.status(500).json({ message: `Server error:${error}` });
    }
};
exports.getLogById = getLogById;
const getMetrics = async (req, res) => {
    try {
        // Get time range from query parameter
        const timeRange = req.query.timeRange || '24h';
        // Calculate date based on time range
        let startDate = new Date();
        switch (timeRange) {
            case '1h':
                startDate.setHours(startDate.getHours() - 1);
                break;
            case '24h':
                startDate.setHours(startDate.getHours() - 24);
                break;
            case '7d':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(startDate.getDate() - 30);
                break;
            default:
                startDate.setHours(startDate.getHours() - 24);
        }
        // Run all queries in parallel with time limits
        const [totalRequests, avgResult, slowEndpoints, errorCount] = await Promise.all([
            // Total requests
            apilogs_model_1.default.countDocuments({ date: { $gte: startDate } }).maxTimeMS(3000),
            // Average response time
            apilogs_model_1.default.aggregate([
                { $match: { date: { $gte: startDate } } },
                { $group: { _id: null, avgResponseTime: { $avg: '$responseTime' } } }
            ]).option({ maxTimeMS: 3000 }),
            // Top 5 slowest endpoints
            apilogs_model_1.default.aggregate([
                { $match: { date: { $gte: startDate } } },
                { $group: { _id: '$endpoint', avgTime: { $avg: '$responseTime' }, count: { $sum: 1 } } },
                { $match: { count: { $gte: 3 } } }, // Only endpoints with 3+ requests
                { $sort: { avgTime: -1 } },
                { $limit: 5 }
            ]).option({ maxTimeMS: 3000 }),
            // Error count
            apilogs_model_1.default.countDocuments({
                date: { $gte: startDate },
                status: { $gte: 400 }
            }).maxTimeMS(3000)
        ]);
        res.json({
            totalRequests,
            avgResponseTime: avgResult[0]?.avgResponseTime || 0,
            slowEndpoints,
            errorCount
        });
    }
    catch (error) {
        console.error('getMetrics error:', error);
        res.status(500).json({ message: 'Error computing metrics', error });
    }
};
exports.getMetrics = getMetrics;
// Controller: Distribution of requests by status code
const getStatusDistribution = async (req, res) => {
    try {
        // Limit to last 7 days for performance
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const filters = { date: { $gte: sevenDaysAgo } };
        // Apply filters from query params
        const { endpoint, date, time, status } = req.query;
        if (endpoint && typeof endpoint === 'string' && endpoint.trim().length > 2) {
            filters.endpoint = { $regex: endpoint.trim(), $options: 'i' };
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
        const distribution = await apilogs_model_1.default.aggregate([
            { $match: filters },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]).option({ maxTimeMS: 3000 }); // 3 second timeout
        res.json({ distribution });
    }
    catch (error) {
        console.error('getStatusDistribution error:', error);
        res.status(500).json({ message: 'Error computing distribution', error });
    }
};
exports.getStatusDistribution = getStatusDistribution;
// Controller: System resource statistics
const getSystemStats = async (req, res) => {
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
};
exports.getSystemStats = getSystemStats;
// Controller: Status code trends over last 7 days
const getStatusTrends = async (req, res) => {
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
        const diff = mapWindow[win] ?? mapWindow['7d'];
        const start = new Date(now.getTime() - diff);
        // Aggregate by day and status category
        const result = await apilogs_model_1.default.aggregate([
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
};
exports.getStatusTrends = getStatusTrends;
// Controller: Top slowest endpoints within a given time window
const getSlowEndpoints = async (req, res) => {
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
        const slowEndpoints = await apilogs_model_1.default.aggregate([
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
};
exports.getSlowEndpoints = getSlowEndpoints;

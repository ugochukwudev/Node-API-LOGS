import { Request, Response } from 'express';
import ApiLog from '../models/apilogs.model';
import os from 'os';

export const getLogs = async (req: Request, res: Response) => {
    const { page = 1, limit = 10, endpoint, date, time, status } = req.query;
    const filters: any = {};
    //@ts-ignore
    if (endpoint && endpoint.length > 1) {
        filters.endpoint = { $regex: endpoint, $options: 'i' }; // Case-insensitive search
    }

    if (date) {
        const start = new Date(date as string);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filters.date = { $gte: start, $lt: end };
    }

    if (time && date) {
        const [hours, minutes] = (time as string).split(':');
        const startTime = new Date(date as string);
        startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 59); // Adjust as needed
        filters.date = { $gte: startTime, $lt: endTime };
    }

    if (status) {
        filters.status = parseInt(status as string);
    }

    try {
        const logs = await ApiLog.find(filters)
            .skip((+page - 1) * +limit)
            .limit(+limit)
            .sort({ date: -1 });

        const total = await ApiLog.countDocuments(filters);

        res.json({ logs, total });
    } catch (error) {
        res.status(500).json({ message: 'Server error' + error });
    }
};


export const getLogById = async (req: Request, res: Response) => {
    const { id } = req.params;


    try {
        const log = await ApiLog.findById(id);
        if (!log) return res.status(404).json({ message: 'Log not found' });

        res.json({ log });
    } catch (error) {
        res.status(500).json({ message: `Server error:${error}` });
    }
};

export const getMetrics = async (req: Request, res: Response) => {
    try {
        // Total number of requests
        const totalRequests = await ApiLog.countDocuments();

        // Average response time across all requests
        const avgResult = await ApiLog.aggregate([
            { $group: { _id: null, avgResponseTime: { $avg: '$responseTime' } } }
        ]);
        const avgResponseTime = avgResult[0]?.avgResponseTime || 0;

        // Top 5 slowest endpoints by average response time
        const slowEndpoints = await ApiLog.aggregate([
            { $group: { _id: '$endpoint', avgTime: { $avg: '$responseTime' }, count: { $sum: 1 } } },
            { $sort: { avgTime: -1 } },
            { $limit: 5 }
        ]);

        // Count of error requests (status >= 400)
        const errorCount = await ApiLog.countDocuments({ status: { $gte: 400 } });

        res.json({ totalRequests, avgResponseTime, slowEndpoints, errorCount });
    } catch (error) {
        res.status(500).json({ message: 'Error computing metrics', error });
    }
};

// Controller: Distribution of requests by status code
export const getStatusDistribution = async (req: Request, res: Response) => {
    // Apply same filters as getLogs
    const { endpoint, date, time, status } = req.query;
    const filters: any = {};
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
        const [hours, minutes] = (time as string).split(':');
        const startTime = new Date(date as string);
        startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 59);
        filters.date = { $gte: startTime, $lt: endTime };
    }
    if (status && typeof status === 'string') {
        filters.status = parseInt(status, 10);
    }
    try {
        const distribution = await ApiLog.aggregate([
            { $match: filters },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        res.json({ distribution });
    } catch (error) {
        res.status(500).json({ message: 'Error computing distribution', error });
    }
};

// Controller: System resource statistics
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

        res.json({ totalMem, freeMem, usedMem, memUsage, loadAvg, uptime, procMem, procMemPercent });
    } catch (error) {
        res.status(500).json({ message: 'Error computing system stats', error });
    }
};

// Controller: Status code trends over last 7 days
export const getStatusTrends = async (req: Request, res: Response) => {
    try {
        // Determine time window from query param (default 7 days)
        const win = (req.query.window as string) || '7d';
        const mapWindow: Record<string, number> = {
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
        const result = await ApiLog.aggregate([
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
        const labels: string[] = [];
        // Determine number of units (days or hours)
        if (win.endsWith('h')) {
            // Hourly labels
            const hours = diff / (1000 * 60 * 60);
            for (let i = hours; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 60 * 60 * 1000);
                labels.push(d.toISOString().slice(0, 13) + ':00');
            }
        } else {
            // Daily labels
            const days = diff / (1000 * 60 * 60 * 24);
            for (let i = days; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                labels.push(d.toISOString().split('T')[0]);
            }
        }

        // Define a Series type for proper indexing
        interface Series {
            success: Record<string, number>;
            client: Record<string, number>;
            server: Record<string, number>;
        }
        // Initialize series
        const series: Series = {
            success: {},
            client: {},
            server: {}
        };
        labels.forEach(day => {
            series.success[day] = 0;
            series.client[day] = 0;
            series.server[day] = 0;
        });

        // Fill series
        interface TrendId { day: string; cat: string }
        result.forEach(item => {
            const id = item._id as TrendId;
            const dayKey = id.day;
            // Cast category to a key of Series
            const catKey = id.cat as keyof Series;
            series[catKey][dayKey] = item.count;
        });

        res.json({ labels, success: labels.map(d => series.success[d]), client: labels.map(d => series.client[d]), server: labels.map(d => series.server[d]) });
    } catch (error) {
        res.status(500).json({ message: 'Error computing status trends', error });
    }
};

// Controller: Top slowest endpoints within a given time window
export const getSlowEndpoints = async (req: Request, res: Response) => {
    try {
        const win = (req.query.window as string) || '1d';
        // Determine milliseconds to subtract for each window
        const map: Record<string, number> = {
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

        const slowEndpoints = await ApiLog.aggregate([
            { $match: { date: { $gte: start } } },
            { $group: { _id: '$endpoint', avgTime: { $avg: '$responseTime' }, count: { $sum: 1 } } },
            { $sort: { avgTime: -1 } },
            { $limit: 5 }
        ]);

        res.json({ slowEndpoints });
    } catch (error) {
        res.status(500).json({ message: 'Error computing slow endpoints', error });
    }
};

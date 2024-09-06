import { Request, Response } from 'express';
import ApiLog from '../models/apilogs.model';

export const getLogs = async (req: Request, res: Response) => {
    const { page = 1, limit = 10, endpoint, date, time, status } = req.query;
    const filters: any = {};
//@ts-ignore
    if (endpoint && endpoint.length >1) {
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
        res.status(500).json({ message: 'Server error'+ error });
    }
};


export const getLogById = async (req: Request, res: Response) => {
    const { id } = req.params;
    

    try {
        const log = await ApiLog.findById(id);
        if (!log) return res.status(404).json({ message: 'Log not found' });

        res.json(log);
    } catch (error) {
        res.status(500).json({ message: `Server error:${error}` });
    }
};

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
exports.getLogById = exports.getLogs = void 0;
const apilogs_model_1 = __importDefault(require("../models/apilogs.model"));
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
        res.json(log);
    }
    catch (error) {
        res.status(500).json({ message: `Server error:${error}` });
    }
});
exports.getLogById = getLogById;
//# sourceMappingURL=api.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const api_1 = require("../controllers/api");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.get('/logs', auth_1.verifyToken, api_1.getLogs);
router.get('/logs/:id', auth_1.verifyToken, api_1.getLogById);
router.get('/metrics', auth_1.verifyToken, api_1.getMetrics);
router.get('/status-dist', auth_1.verifyToken, api_1.getStatusDistribution);
router.get('/system', auth_1.verifyToken, api_1.getSystemStats);
router.get('/status-trends', auth_1.verifyToken, api_1.getStatusTrends);
router.get('/slow-endpoints', auth_1.verifyToken, api_1.getSlowEndpoints);
exports.default = router;
//# sourceMappingURL=api.js.map
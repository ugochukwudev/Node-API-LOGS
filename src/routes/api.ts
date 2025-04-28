import express from 'express';
import { getLogs, getLogById, getMetrics, getStatusDistribution, getSystemStats, getStatusTrends, getSlowEndpoints } from '../controllers/api';
import { verifyToken } from '../middleware/auth';

const router = express.Router();

router.get('/logs', verifyToken, getLogs);
router.get('/logs/:id', verifyToken, getLogById);
router.get('/metrics', verifyToken, getMetrics);
router.get('/status-dist', verifyToken, getStatusDistribution);
router.get('/system', verifyToken, getSystemStats);
router.get('/status-trends', verifyToken, getStatusTrends);
router.get('/slow-endpoints', verifyToken, getSlowEndpoints);

export default router;

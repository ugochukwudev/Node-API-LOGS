import express from 'express';
import {
    getLogs, getLogById, getMetrics, getStatusDistribution, getSystemStats, getStatusTrends, getSlowEndpoints,
    getExportFormats, exportLogsHandler, deleteLogsHandler, getSummariesInfo, deleteSummariesHandler,
} from '../controllers/api';
import { verifyToken, requireAdmin } from '../middleware/auth';

const router = express.Router();
router.use(express.json({ limit: '100kb' }));

router.get('/logs', verifyToken, getLogs);
router.get('/logs/:id', verifyToken, getLogById);
router.get('/metrics', verifyToken, getMetrics);
router.get('/status-dist', verifyToken, getStatusDistribution);
router.get('/system', verifyToken, getSystemStats);
router.get('/status-trends', verifyToken, getStatusTrends);
router.get('/slow-endpoints', verifyToken, getSlowEndpoints);

// Export (everyone signed in) and deleting (admins)
router.get('/export/formats', verifyToken, getExportFormats);
router.get('/export', verifyToken, exportLogsHandler);
router.post('/logs/delete', verifyToken, requireAdmin, deleteLogsHandler);
router.get('/summaries', verifyToken, getSummariesInfo);
router.post('/summaries/delete', verifyToken, requireAdmin, deleteSummariesHandler);

export default router;

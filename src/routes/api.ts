import express from 'express';
import {
    getLogs, getLogById, getMetrics, getStatusDistribution, getSystemStats, getStatusTrends, getSlowEndpoints,
    getExportFormats, exportLogsHandler, deleteLogsHandler, getSummariesInfo, deleteSummariesHandler,
} from '../controllers/api';
import { listJobs, getJob, getLogJobs } from '../controllers/jobs';
import {
    getAlertSettings, getAlertStatus, saveAlertSettings, sendTestEmail,
    listRules, createRule, updateRule, deleteRule, getDigest, setDigest,
} from '../controllers/alerts';
import { verifyToken, requireAdmin } from '../middleware/auth';

const router = express.Router();
router.use(express.json({ limit: '100kb' }));

router.get('/logs', verifyToken, getLogs);
router.get('/logs/:id', verifyToken, getLogById);
router.get('/logs/:id/jobs', verifyToken, getLogJobs);
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

// Queued jobs
router.get('/jobs', verifyToken, listJobs);
router.get('/jobs/:id', verifyToken, getJob);

// Alerts: email settings (admins), rules (personal; team rules by admins), daily summary
router.get('/alerts/status', verifyToken, getAlertStatus);
router.get('/alerts/settings', verifyToken, requireAdmin, getAlertSettings);
router.put('/alerts/settings', verifyToken, requireAdmin, saveAlertSettings);
router.post('/alerts/test', verifyToken, requireAdmin, sendTestEmail);
router.get('/alerts/rules', verifyToken, listRules);
router.post('/alerts/rules', verifyToken, createRule);
router.put('/alerts/rules/:id', verifyToken, updateRule);
router.delete('/alerts/rules/:id', verifyToken, deleteRule);
router.get('/alerts/digest', verifyToken, getDigest);
router.put('/alerts/digest', verifyToken, setDigest);

export default router;

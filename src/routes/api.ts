import express from 'express';
import { getLogs, getLogById } from '../controllers/api';
import { verifyToken } from '../middleware/auth';

const router = express.Router();

router.get('/logs', verifyToken, getLogs);
router.get('/logs/:id', verifyToken, getLogById);

export default router;

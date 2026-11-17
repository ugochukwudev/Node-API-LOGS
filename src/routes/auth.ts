import express from 'express';
import {
    loginUser, logoutUser, setupTwoFactor, enableTwoFactor, verifyTwoFactor, getMe,
    createInviteLink, getInvite, acceptInvite, getUsers, removeUser, resetUserTwoFactor,
} from '../controllers/auth';
import { verifyToken, requirePending, requireAdmin } from '../middleware/auth';

const router = express.Router();
// Don't depend on the host app having a JSON body parser; skipped if it already ran.
router.use(express.json({ limit: '10kb' }));

// Sign-in: password, then authenticator (or first-time enrollment)
router.post('/login', loginUser);
router.get('/2fa/setup', requirePending('enroll'), setupTwoFactor);
router.post('/2fa/enable', requirePending('enroll'), enableTwoFactor);
router.post('/2fa/verify', requirePending('2fa'), verifyTwoFactor);
router.post('/logout', logoutUser);
router.get('/me', verifyToken, getMe);

// Invite links (public endpoints are protected by the single-use token)
router.post('/invites', verifyToken, requireAdmin, createInviteLink);
router.get('/invites/:token', getInvite);
router.post('/invites/:token/accept', acceptInvite);

// User management (admins)
router.get('/users', verifyToken, requireAdmin, getUsers);
router.delete('/users/:userId', verifyToken, requireAdmin, removeUser);
router.post('/users/:userId/reset-2fa', verifyToken, requireAdmin, resetUserTwoFactor);

export default router;

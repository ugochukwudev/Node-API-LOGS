import express from 'express';
import { loginUser, logoutUser, addUser, getUsers, removeUser } from '../controllers/auth';
import { verifyToken } from '../middleware/auth';

const router = express.Router();

router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/add-user', verifyToken, addUser);
router.get('/users', verifyToken, getUsers);
router.delete('/users/:userId', verifyToken, removeUser);

export default router;

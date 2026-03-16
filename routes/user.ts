import express from 'express';
import { register, login, logout, updateUser, deleteUser } from '../controlers/auth';
import { authenticateUser } from '../middleware/authentication';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.get('/logout', authenticateUser, logout);

// Protected routes
router.patch('/updateUser', authenticateUser, updateUser);
router.delete('/deleteUser', authenticateUser, deleteUser);

export default router;

import express from 'express';
import { reconstructBalance, reconstructAllWallets } from '../controlers/reconciliation';
import { authenticateUser, authorizePermissions } from '../middleware/authentication';

const router = express.Router();

// All reconciliation routes require authentication + admin role
router.use(authenticateUser);
router.use(authorizePermissions('admin', 'super-admin'));

// GET /reconciliation/:walletId/reconstruct - Reconstruct single wallet balance
router.get('/:walletId/reconstruct', reconstructBalance);

// POST /reconciliation/reconstruct-all - Batch reconstruct all wallets (super-admin only)
router.post('/reconstruct-all', authorizePermissions('super-admin'), reconstructAllWallets);

export default router;
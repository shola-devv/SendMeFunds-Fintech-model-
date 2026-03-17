import express from 'express';
import {
  createWallet,
  getWallet,
  findWallet,
  fundWallet,
  transferMoney,
  viewLedger,
  viewAuditLogs,
} from '../controlers/wallet';
import { authenticateUser, authorizePermissions } from '../middleware/authentication';

const router = express.Router();

// All wallet routes require authentication
router.use(authenticateUser);

// POST /wallets - Create wallet with initial 1000 NGN credit
router.post('/', createWallet);

// GET /wallets - Get authenticated user's wallet
router.get('/', getWallet);

// GET /wallets/search - Search wallet by userId, email, or phone
router.get('/search', findWallet);

// POST /wallets/fund - Fund wallet (requires PIN verification)
router.post('/fund', fundWallet);

// POST /wallets/transfer - Transfer money between wallets
router.post('/transfer', transferMoney);

// GET /wallets/ledger/:walletId - View ledger/transactions
router.get('/ledger/:walletId', viewLedger);

// GET /wallets/audit/:walletId - View audit logs
router.get('/audit/:walletId', viewAuditLogs);

export default router;

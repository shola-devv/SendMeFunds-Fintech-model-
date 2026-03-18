import express from 'express';
import {
  createWallet,
  getWallet,
  findWallet,
  fundWallet,
  getRandomWallets,
  transfer,           // ← was transferMoney
  viewLedger,
  viewAuditLogs,

} from '../controlers/wallet';  // ← reconstructBalance/All removed from here
import { authenticateUser, authorizePermissions } from '../middleware/authentication';

const router = express.Router();

router.use(authenticateUser);

router.post('/', createWallet);
router.get('/', getWallet);
router.get('/search', findWallet);
router.post('/fund', authorizePermissions('super-admin'), fundWallet);
router.post('/transfer', transfer);
router.get('/ledger/:walletId', viewLedger);
router.get('/audit/:walletId', viewAuditLogs);
router.get('/wallets', getRandomWallets);



export default router;
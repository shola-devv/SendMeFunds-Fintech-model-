import { Request, Response } from 'express';
import Wallet from '../models/wallet';
import User from '../models/User';
import AuditLog from '../models/auditLog';

// POST /wallets - Create wallet with initial 1000 NGN credit
const createWallet = async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    const userId = (req as any).user?.userId;

    // Validate PIN is provided
    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }

    // Validate user exists
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if wallet already exists for this user
    const existingWallet = await Wallet.findOne({ userId });
    if (existingWallet) {
      return res.status(400).json({ error: 'Wallet already exists for this user' });
    }

    // Create wallet with 1000 NGN initial balance (stored as float)
    const initialBalance = 1000.0;
    const wallet = await Wallet.create({
      userId,
      balance: initialBalance,
      currency: 'NGN',
      pin,
    });

    // Create audit log for wallet creation
    await AuditLog.create({
      action: 'wallet_created',
      userId,
      walletId: wallet._id,
      amount: initialBalance,
      status: 'success',
      reference: `wallet_${wallet._id}`,
    });

    res.status(201).json({
      message: 'Wallet created successfully with 1000 NGN initial balance',
      wallet: {
        id: wallet._id,
        userId: wallet.userId,
        balance: wallet.balance,
        currency: wallet.currency,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET /wallets/:id - Display wallet info (balance, user, etc)
const getWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const wallet = await Wallet.findOne({ userId }).populate('userId', 'name email phone');
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.status(200).json({
      wallet: {
        id: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        user: wallet.userId,
        createdAt: wallet.createdAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET /wallets/search - Search wallet by userId, email, phone
const findWallet = async (req: Request, res: Response) => {
  try {
    const { userId, email, phone } = req.query;
    const requestingUserId = (req as any).user?.userId;

    if (!requestingUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let query: any = {};

    if (userId) {
      query.userId = userId;
    } else if (email || phone) {
      const user = await User.findOne({
        ...(email && { email }),
        ...(phone && { phone }),
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      query.userId = user._id;
    }

    const wallet = await Wallet.findOne(query).populate('userId', 'name email phone');
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.status(200).json({
      wallet: {
        id: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        user: wallet.userId,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST /wallets/fund - Add funds to user wallet (requires PIN verification)
const fundWallet = async (req: Request, res: Response) => {
  try {
    const { amount, pin } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Verify PIN
    const isPinCorrect = await wallet.comparePin(pin);
    if (!isPinCorrect) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    const balanceBefore = wallet.balance;
    wallet.balance += amount;
    await wallet.save();

    // Create audit log
    await AuditLog.create({
      action: 'fund_wallet',
      userId,
      walletId: wallet._id,
      amount,
      status: 'success',
      reference: `fund_${wallet._id}_${Date.now()}`,
    });

    res.status(200).json({
      message: 'Wallet funded successfully',
      wallet: {
        id: wallet._id,
        balanceBefore,
        balanceAfter: wallet.balance,
        amount,
        currency: wallet.currency,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST /wallets/transfer - Transfer money between wallets
const transferMoney = async (req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

// GET /wallets/ledger/:walletId - View all transactions of a wallet
const viewLedger = async (req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

// GET /wallets/audit/:walletId - View audit logs for wallet
const viewAuditLogs = async (req: Request, res: Response) => {
  try {
    const { walletId } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify user owns this wallet
    const wallet = await Wallet.findById(walletId);
    if (!wallet || wallet.userId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - You do not own this wallet' });
    }

    const auditLogs = await AuditLog.find({ walletId }).sort({ timestamp: -1 });

    res.status(200).json({
      walletId,
      totalLogs: auditLogs.length,
      logs: auditLogs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export {
  createWallet,
  getWallet,
  findWallet,
  fundWallet,
  transferMoney,
  viewLedger,
  viewAuditLogs,
};
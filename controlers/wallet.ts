import { Response } from 'express';
import mongoose from 'mongoose';
import Wallet from '../models/wallet';
import User from '../models/User';
import AuditLog from '../models/auditLog';
import Ledger from '../models/ledger';
import IdempotencyKey from '../models/idempotencyKey';
import { AuthRequest } from '../middleware/authentication';

// POST /wallets - Create wallet with initial 1000 NGN credit
const createWallet = async (req: AuthRequest, res: Response) => {
  try {
    const { pin } = req.body;
    const userId = req.user?.userId;

    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingWallet = await Wallet.findOne({ userId });
    if (existingWallet) {
      return res.status(400).json({ error: 'Wallet already exists for this user' });
    }

    const initialBalance = 1000.0;

    const wallet = await Wallet.create({
      userId,
      balance: initialBalance,
      currency: 'NGN',
      pin,
    });

    await Ledger.create({
      walletId: wallet._id,
      type: 'credit',
      amount: initialBalance,
      balanceBefore: 0,
      balanceAfter: initialBalance,
      reference: `init_${wallet._id}_${Date.now()}`,
      description: 'Initial wallet funding',
      status: 'success',
    });

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

// GET /wallets/:id - Display wallet info
const getWallet = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

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
        createdAt: (wallet as any).createdAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET /wallets/search - Search wallet by walletId, email, phone
const findWallet = async (req: AuthRequest, res: Response) => {
  try {
    const { walletId, email, phone } = req.query;
    const requestingUserId = req.user?.userId;

    if (!requestingUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let query: any = {};

    if (walletId) {                         // ← fixed typo: walletID → walletId
      query._id = walletId;
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
       
        currency: wallet.currency,
        user: wallet.userId,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET /wallets/random?page=1&limit=15
const getRandomWallets = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 15, 50);

    const wallets = await Wallet.aggregate([
      { $sample: { size: limit } },
      { $project: { _id: 1, balance: 1, currency: 1, createdAt: 1 } },
    ]);

    res.status(200).json({
      count: wallets.length,
      wallets: wallets.map((w) => ({
        walletId: w._id,
        currency: w.currency,
        createdAt: w.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST /wallets/fund
const fundWallet = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, pin } = req.body;
    const { walletId } = req.query;
    const authUser = req.user;

    if (!authUser?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (authUser.role !== 'super-admin') {
      return res.status(403).json({ error: 'Forbidden: Super admin only' });
    }

    if (!walletId) {
      return res.status(400).json({ error: 'walletId is required' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }

    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const isPinCorrect = await wallet.comparePin(pin);
    if (!isPinCorrect) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    const balanceBefore = wallet.balance;
    const numericAmount = Number(amount);

    wallet.balance += numericAmount;
    await wallet.save();

    const reference = `fund_${wallet._id}_${Date.now()}`;

    await Ledger.create({
      walletId: wallet._id,
      type: 'credit',
      amount: numericAmount,
      balanceBefore,
      balanceAfter: wallet.balance,
      reference,
      description: 'Admin wallet funding',
      status: 'success',
    });

    // ← metadata removed (not in AuditLog schema)
    await AuditLog.create({
      action: 'fund_wallet',
      userId: authUser.userId,
      walletId: wallet._id,
      amount: numericAmount,
      status: 'success',
      reference,
    });

    res.status(200).json({
      message: 'Wallet funded successfully',
      wallet: {
        id: wallet._id,
        balanceBefore,
        balanceAfter: wallet.balance,
        amount: numericAmount,
        currency: wallet.currency,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST /wallets/transfer
const transfer = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();   // ← mongoose now imported

  try {
    const { senderWalletId, receiverWalletId, amount, pin } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const authUser = req.user;

    if (!senderWalletId || !receiverWalletId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (senderWalletId === receiverWalletId) {
      return res.status(400).json({ error: 'Cannot transfer to same wallet' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Idempotency-Key required' });
    }

    // Check idempotency outside transaction
    const existing = await IdempotencyKey.findOne({ key: idempotencyKey }); // ← fixed name
    if (existing) {
      return res.status(200).json(existing.response);
    }

    await session.startTransaction();

    const existingInTxn = await IdempotencyKey.findOne({ key: idempotencyKey }).session(session);
    if (existingInTxn) {
      await session.abortTransaction();
      return res.status(200).json(existingInTxn.response);
    }

    const sender = await Wallet.findById(senderWalletId).session(session);
    const receiver = await Wallet.findById(receiverWalletId).session(session);

    if (!sender || !receiver) throw new Error('Wallet not found');

    const isPinCorrect = await sender.comparePin(pin);
    if (!isPinCorrect) throw new Error('Invalid PIN');

    if (sender.balance < amount) throw new Error('Insufficient funds');

    const senderBefore = sender.balance;
    const receiverBefore = receiver.balance;

    sender.balance -= amount;
    receiver.balance += amount;

    await sender.save({ session });
    await receiver.save({ session });

    const reference = `tx_${Date.now()}`;

    await Ledger.create(
      [
        {
          walletId: sender._id,
          type: 'debit',
          amount,
          balanceBefore: senderBefore,
          balanceAfter: sender.balance,
          reference,
          description: 'Transfer sent',
          status: 'success',
        },
        {
          walletId: receiver._id,
          type: 'credit',
          amount,
          balanceBefore: receiverBefore,
          balanceAfter: receiver.balance,
          reference,
          description: 'Transfer received',
          status: 'success',
        },
      ],
      { session }
    );

    // ← metadata removed from AuditLog
    await AuditLog.create(
      [{ action: 'wallet_transfer', userId: authUser?.userId, amount, status: 'success', reference }],
      { session }
    );

    const response = {
      message: 'Transfer successful',
      reference,
      amount,
      from: senderWalletId,
      to: receiverWalletId,
    };

    await IdempotencyKey.create([{ key: idempotencyKey, response }], { session }); // ← fixed name

    await session.commitTransaction();
    res.status(200).json(response);
  } catch (err: any) {
    await session.abortTransaction();
    res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

// GET /wallets/ledger/:walletId
const viewLedger = async (req: AuthRequest, res: Response) => {
  try {
    const { walletId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const authUser = req.user;

    if (!authUser?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const isOwner = wallet.userId.toString() === authUser.userId;
    const isAdmin = ['admin', 'super-admin'].includes(authUser.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const pageNumber = Number(page);
    const limitNumber = Math.min(Number(limit), 50);
    const skip = (pageNumber - 1) * limitNumber;

    // ← using Ledger instead of Transaction (Transaction was never imported)
    const entries = await Ledger.find({ walletId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const total = await Ledger.countDocuments({ walletId });

    res.status(200).json({
      walletId,
      totalTransactions: total,
      currentPage: pageNumber,
      totalPages: Math.ceil(total / limitNumber),
      transactions: entries.map((tx) => ({
        id: tx._id,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        reference: tx.reference,
        createdAt: tx.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET /wallets/audit/:walletId
const viewAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { walletId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

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
  getRandomWallets,
  fundWallet,
  transfer,
  viewLedger,
  viewAuditLogs,
};
import { Request, Response } from 'express';
import Wallet from '../models/wallet';
import User from '../models/User';
import AuditLog from '../models/auditLog';
import Ledger from '../models/ledger';

// POST /wallets - Create wallet with initial 1000 NGN credit
const createWallet = async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    const userId = (req as any).user?.userId;

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

    //  CREATE LEDGER ENTRY (VERY IMPORTANT)
    await Ledger.create({
      walletId: wallet._id,
      type: "credit",
      amount: initialBalance,
      balanceBefore: 0,
      balanceAfter: initialBalance,
      reference: `init_${wallet._id}_${Date.now()}`,
      description: "Initial wallet funding",
      status: "success",
    });

    // Audit log
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



// GET /wallets/:id - Display wallet info (balance, user, etc) // for user only, use userID
const getWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    \
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

// GET /wallets/search - Search wallet by walletId, email, phone
const findWallet = async (req: Request, res: Response) => {
  try {
    const { walletId, email, phone } = req.query;
    const requestingUserId = (req as any).user?.userId;

    if (!requestingUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let query: any = {};


    //search by wallet here first
    if (walletID) {
      query.walletId = walletId;
    } else if (email || phone) {
      const user = await User.findOne({
        ...(email && { email }),
        ...(phone && { phone }),
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      query.walletId = user._id;
    }

    const wallet = await Wallet.findOne(query).populate('walletId', 'name email phone');
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



// GET /wallets/random?page=1&limit=15
const getRandomWallets = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 15, 50); // max 50

    const skip = (page - 1) * limit;

    // 🎲 Option 1: true random (best for UI display)
    const wallets = await Wallet.aggregate([
      { $sample: { size: limit } },
      {
        $project: {
          _id: 1,
          balance: 1,
          currency: 1,
          createdAt: 1
        }
      }
    ]);

    res.status(200).json({
      count: wallets.length,
      wallets: wallets.map((w) => ({
        walletId: w._id,
        currency: w.currency,
        createdAt: w.createdAt
      }))
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};



// POST /wallets/fund - Add funds to user wallet (requires PIN verification)
// POST /wallets/fund?walletId=xxx
const fundWallet = async (req: Request, res: Response) => {
  try {
    const { amount, pin } = req.body;
    const { walletId } = req.query;

    const authUser = (req as any).user;

    if (!authUser?.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (authUser.role !== "super-admin") {
      return res.status(403).json({ error: "Forbidden: Super admin only" });
    }

    if (!walletId) {
      return res.status(400).json({ error: "walletId is required" });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!pin) {
      return res.status(400).json({ error: "PIN is required" });
    }

    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const isPinCorrect = await wallet.comparePin(pin);
    if (!isPinCorrect) {
      return res.status(401).json({ error: "Invalid PIN" });
    }

    const balanceBefore = wallet.balance;
    const numericAmount = Number(amount);

    // 💰 Update balance
    wallet.balance += numericAmount;
    await wallet.save();

    const reference = `fund_${wallet._id}_${Date.now()}`;

    // ✅ LEDGER ENTRY (VERY IMPORTANT)
    await Ledger.create({
      walletId: wallet._id,
      type: "credit",
      amount: numericAmount,
      balanceBefore,
      balanceAfter: wallet.balance,
      reference,
      description: "Admin wallet funding",
      status: "success",
    });

    // ✅ IMPROVED AUDIT LOG
    await AuditLog.create({
      action: "fund_wallet",
      userId: authUser.userId,     // who performed action
      walletId: wallet._id,        // affected wallet
      amount: numericAmount,
      status: "success",
      reference,
      metadata: {
        performedByRole: authUser.role,
        ip: req.ip,
      }
    });

    res.status(200).json({
      message: "Wallet funded successfully",
      wallet: {
        id: wallet._id,
        balanceBefore,
        balanceAfter: wallet.balance,
        amount: numericAmount,
        currency: wallet.currency
      }
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};










// POST /wallets/transfer - Transfer money between wallets
const transferMoney = async (req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented yet' });
};











// GET /wallets/ledger/:walletId?page=1&limit=20
const viewLedger = async (req: Request, res: Response) => {
  try {
    const { walletId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const authUser = (req as any).user;

    // 🔐 1. Check authentication
    if (!authUser?.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // 🔍 2. Find wallet
    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    // 🔐 3. Authorization (owner OR admin/super-admin)
    const isOwner = wallet.userId.toString() === authUser.userId;
    const isAdmin = ["admin", "super-admin"].includes(authUser.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // 📄 4. Pagination setup
    const pageNumber = Number(page);
    const limitNumber = Math.min(Number(limit), 50); // max 50
    const skip = (pageNumber - 1) * limitNumber;

    // 📊 5. Fetch transactions
    const transactions = await Transaction.find({ walletId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const total = await Transaction.countDocuments({ walletId });

    // 📦 6. Response
    res.status(200).json({
      walletId,
      totalTransactions: total,
      currentPage: pageNumber,
      totalPages: Math.ceil(total / limitNumber),
      transactions: transactions.map((tx) => ({
        id: tx._id,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        reference: tx.reference,
        createdAt: tx.createdAt
      }))
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
  getRandomWallets
  fundWallet,
  transferMoney,
  viewLedger,
  viewAuditLogs,
};
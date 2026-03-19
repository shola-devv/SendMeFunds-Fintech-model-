import { Response } from 'express';
import mongoose from 'mongoose';
import Wallet from '../models/wallet';
import User from '../models/User';
import AuditLog from '../models/auditLog';
import Ledger from '../models/ledger';
import IdempotencyKey from '../models/idempotencyKey';
import { AuthRequest } from '../middleware/authentication';
import { QueryTypes }        from 'sequelize';
import * as bcrypt           from 'bcryptjs';
import * as crypto           from 'crypto';
import { sequelize }         from '../config/postgres';




interface WalletRow {
  id:        number;
  mongo_id:  string;
  user_id:   string;
  balance:   string;    // Sequelize returns DECIMAL as string — parse with parseFloat
  pin_hash:  string | null;
  is_active: boolean;
}
 
interface IdempotencyRow {
  id:       number;
  key:      string;
  user_id:  string;
  response: object;   // JSONB already parsed by pg driver
}


//helper functions 
function generateReference(): string {
  return `tx_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}
 
function hashRequestBody(body: object): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex');
}


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

    if (!req.user?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let wallet;

    if (walletId) {
      wallet = await Wallet.findById(walletId).populate('userId', 'name email phone');
    } else if (email || phone) {
      const user = await User.findOne({
        ...(email && { email }),
        ...(phone && { phone }),
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      wallet = await Wallet.findOne({ userId: user._id }).populate('userId', 'name email phone');
    } else {
      return res.status(400).json({ error: 'Provide walletId, email, or phone' });
    }

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    return res.status(200).json({
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
const transfer   = async (
  req: AuthRequest,
  res: Response,
): Promise<Response> => {
  const { senderWalletId, receiverWalletId, amount, pin } = req.body as {
    senderWalletId:   string;
    receiverWalletId: string;
    amount:           number;
    pin:              string;
  };
 
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const userId         = req.user?.userId;
 
  // ── 1. Basic input validation ─────────────────────────────────────────────
 
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorised' });
  }
 
  if (!senderWalletId || !receiverWalletId || !amount || !pin) {
    return res.status(400).json({
      success: false,
      message: 'senderWalletId, receiverWalletId, amount, and pin are required',
    });
  }
 
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'amount must be a positive number',
    });
  }
 
  if (senderWalletId === receiverWalletId) {
    return res.status(400).json({
      success: false,
      message: 'Sender and receiver wallets must be different',
    });
  }
 
  if (!idempotencyKey) {
    return res.status(400).json({
      success: false,
      message: 'Idempotency-Key header is required',
    });
  }
 
  // ── 2. Idempotency check (outside transaction — read-only) ────────────────
  //    If this exact key was used before, replay the stored response.
 
  const existingKeys = await sequelize.query<IdempotencyRow>(
    `SELECT id, key, user_id, response
       FROM idempotency_keys
      WHERE key      = :idempotencyKey
        AND user_id  = :userId
        AND expires_at > NOW()
      LIMIT 1`,
    {
      replacements: { idempotencyKey, userId },
      type:         QueryTypes.SELECT,
    },
  );
 
  if (existingKeys.length > 0) {
    return res.status(200).json({
      success:     true,
      message:     'Duplicate request — returning cached response',
      idempotent:  true,
      data:        existingKeys[0].response,
    });
  }
 
  // ── 3. Open a raw transaction ─────────────────────────────────────────────
 
  const t = await sequelize.transaction();
 
  try {
    // ── 4. Lock both wallet rows with FOR UPDATE ──────────────────────────
    //    Always lock lower mongo_id first to prevent deadlocks when two
    //    concurrent transfers involve the same pair of wallets in reverse.
 
    const [firstId, secondId] =
      senderWalletId < receiverWalletId
        ? [senderWalletId, receiverWalletId]
        : [receiverWalletId, senderWalletId];
 
    // Lock in deterministic order
    await sequelize.query(
      `SELECT id FROM wallets
        WHERE mongo_id IN (:firstId, :secondId)
        ORDER BY mongo_id
        FOR UPDATE`,
      {
        replacements: { firstId, secondId },
        type:         QueryTypes.SELECT,
        transaction:  t,
      },
    );
 
    // ── 5. Read current sender wallet state ───────────────────────────────
 
    const senderRows = await sequelize.query<WalletRow>(
      `SELECT id, mongo_id, user_id, balance, pin_hash, is_active
         FROM wallets
        WHERE mongo_id = :senderWalletId
        LIMIT 1`,
      {
        replacements: { senderWalletId },
        type:         QueryTypes.SELECT,
        transaction:  t,
      },
    );
 
    if (senderRows.length === 0) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Sender wallet not found' });
    }
 
    const sender = senderRows[0];
 
    if (!sender.is_active) {
      await t.rollback();
      return res.status(403).json({ success: false, message: 'Sender wallet is inactive' });
    }
 
    // ── 6. Verify PIN ─────────────────────────────────────────────────────
 
    if (!sender.pin_hash) {
      await t.rollback();
      return res.status(403).json({ success: false, message: 'Transaction PIN not set' });
    }
 
    const pinValid = await bcrypt.compare(pin, sender.pin_hash);
    if (!pinValid) {
      await t.rollback();
      return res.status(403).json({ success: false, message: 'Invalid PIN' });
    }
 
    // ── 7. Check sufficient balance ───────────────────────────────────────
    //    Parse DECIMAL string → number for arithmetic
 
    const senderBalance = parseFloat(sender.balance);
    if (senderBalance < amount) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: ${senderBalance.toFixed(2)}`,
      });
    }
 
    // ── 8. Read receiver wallet ───────────────────────────────────────────
 
    const receiverRows = await sequelize.query<WalletRow>(
      `SELECT id, mongo_id, user_id, balance, is_active
         FROM wallets
        WHERE mongo_id = :receiverWalletId
        LIMIT 1`,
      {
        replacements: { receiverWalletId },
        type:         QueryTypes.SELECT,
        transaction:  t,
      },
    );
 
    if (receiverRows.length === 0) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Receiver wallet not found' });
    }
 
    const receiver = receiverRows[0];
 
    if (!receiver.is_active) {
      await t.rollback();
      return res.status(403).json({ success: false, message: 'Receiver wallet is inactive' });
    }
 
    const receiverBalance = parseFloat(receiver.balance);
 
    // ── 9. Compute new balances ───────────────────────────────────────────
    //    Use toFixed(2) so we always write valid DECIMAL(15,2) strings
 
    const newSenderBalance   = (senderBalance   - amount).toFixed(2);
    const newReceiverBalance = (receiverBalance + amount).toFixed(2);
    const reference          = generateReference();
    const debitRef           = `${reference}_debit`;
    const creditRef          = `${reference}_credit`;
    const now                = new Date().toISOString();
 
    // ── 10. Deduct from sender ────────────────────────────────────────────
 
    await sequelize.query(
      `UPDATE wallets
          SET balance    = :newSenderBalance,
              updated_at = NOW()
        WHERE mongo_id   = :senderWalletId`,
      {
        replacements: { newSenderBalance, senderWalletId },
        type:         QueryTypes.UPDATE,
        transaction:  t,
      },
    );
 
    // ── 11. Credit receiver ───────────────────────────────────────────────
 
    await sequelize.query(
      `UPDATE wallets
          SET balance    = :newReceiverBalance,
              updated_at = NOW()
        WHERE mongo_id   = :receiverWalletId`,
      {
        replacements: { newReceiverBalance, receiverWalletId },
        type:         QueryTypes.UPDATE,
        transaction:  t,
      },
    );
 
    // ── 12. Double-entry ledger ───────────────────────────────────────────
    //    DEBIT row for sender
 
    await sequelize.query(
      `INSERT INTO ledgers
         (wallet_id, type, amount, balance_after, reference, description, created_at)
       VALUES
         (:walletId, 'debit', :amount, :balanceAfter, :reference, :description, NOW())`,
      {
        replacements: {
          walletId:     senderWalletId,
          amount:       amount.toFixed(2),
          balanceAfter: newSenderBalance,
          reference:    debitRef,
          description:  `Transfer to ${receiverWalletId} | ref: ${reference}`,
        },
        type:        QueryTypes.INSERT,
        transaction: t,
      },
    );
 
    //    CREDIT row for receiver
 
    await sequelize.query(
      `INSERT INTO ledgers
         (wallet_id, type, amount, balance_after, reference, description, created_at)
       VALUES
         (:walletId, 'credit', :amount, :balanceAfter, :reference, :description, NOW())`,
      {
        replacements: {
          walletId:     receiverWalletId,
          amount:       amount.toFixed(2),
          balanceAfter: newReceiverBalance,
          reference:    creditRef,
          description:  `Transfer from ${senderWalletId} | ref: ${reference}`,
        },
        type:        QueryTypes.INSERT,
        transaction: t,
      },
    );
 
    // ── 13. Audit log ─────────────────────────────────────────────────────
 
    const auditMetadata = JSON.stringify({
      reference,
      amount,
      senderWalletId,
      receiverWalletId,
      senderBalanceBefore:   senderBalance.toFixed(2),
      senderBalanceAfter:    newSenderBalance,
      receiverBalanceBefore: receiverBalance.toFixed(2),
      receiverBalanceAfter:  newReceiverBalance,
    });
 
    await sequelize.query(
      `INSERT INTO audit_logs
         (user_id, action, entity, entity_id, metadata, created_at)
       VALUES
         (:userId, 'TRANSFER', 'wallet', :entityId, :metadata::jsonb, NOW())`,
      {
        replacements: {
          userId,
          entityId: senderWalletId,
          metadata: auditMetadata,
        },
        type:        QueryTypes.INSERT,
        transaction: t,
      },
    );
 
    // ── 14. Build response payload (stored verbatim for idempotency) ──────
 
    const responsePayload = {
      reference,
      amount,
      senderWalletId,
      receiverWalletId,
      senderNewBalance:   parseFloat(newSenderBalance),
      receiverNewBalance: parseFloat(newReceiverBalance),
      timestamp:          now,
      ledger: {
        debit:  debitRef,
        credit: creditRef,
      },
    };
 
    // ── 15. Store idempotency key with JSONB response ─────────────────────
 
    await sequelize.query(
      `INSERT INTO idempotency_keys
         (key, user_id, request_hash, response, created_at, expires_at)
       VALUES
         (:idempotencyKey, :userId, :requestHash, :response::jsonb, NOW(), NOW() + INTERVAL '24 hours')`,
      {
        replacements: {
          idempotencyKey,
          userId,
          requestHash: hashRequestBody({ senderWalletId, receiverWalletId, amount }),
          response:    JSON.stringify(responsePayload),
        },
        type:        QueryTypes.INSERT,
        transaction: t,
      },
    );
 
    // ── 16. Commit ────────────────────────────────────────────────────────
 
    await t.commit();
 
    return res.status(200).json({
      success: true,
      message: 'Transfer successful',
      data:    responsePayload,
    });
 
  } catch (error: unknown) {
    // ── Rollback on any error ─────────────────────────────────────────────
    await t.rollback();
 
    console.error('[transferFunds] Error:', error);
 
    // Surface unique-constraint violation (duplicate reference / idempotency key)
    if (
      error instanceof Error &&
      error.message.includes('unique constraint')
    ) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate transaction detected',
      });
    }
 
    return res.status(500).json({
      success: false,
      message: 'Transfer failed due to an internal error',
    });
  }
}


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
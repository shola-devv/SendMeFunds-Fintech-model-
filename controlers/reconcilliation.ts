import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Wallet from '../models/wallet';
import Ledger from '../models/ledger';

const reconstructBalance = async (req: Request, res: Response) => {
  try {
    const { walletId } = req.params;

    if (!walletId) {
      return res.status(400).json({ error: 'walletId is required' });
    }

    const ledger = await Ledger.find({ walletId }).sort({ createdAt: 1 });

    if (!ledger.length) {
      return res.status(404).json({ error: 'No ledger entries found for this wallet' });
    }

    let balance = 0;
    for (const entry of ledger) {
      if (entry.type === 'credit') balance += entry.amount;
      else if (entry.type === 'debit') balance -= entry.amount;
    }

    const wallet = await Wallet.findByIdAndUpdate(walletId, { balance }, { new: true });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.status(200).json({
      message: 'Wallet balance successfully reconstructed from ledger',
      wallet: { id: wallet._id, userId: wallet.userId, balance: wallet.balance, currency: wallet.currency },
      calculatedFromLedger: balance,
      ledgerEntries: ledger.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

const reconstructAllWallets = async (_req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const wallets = await Wallet.find({}).session(session);
    const results: { walletId: string; oldBalance: number; newBalance: number }[] = [];

    for (const wallet of wallets) {
      const ledger = await Ledger.find({ walletId: wallet._id }).sort({ createdAt: 1 }).session(session);
      if (!ledger.length) continue;

      let balance = 0;
      for (const entry of ledger) {
        if (entry.type === 'credit') balance += entry.amount;
        else if (entry.type === 'debit') balance -= entry.amount;
      }

      const oldBalance = wallet.balance;
      wallet.balance = balance;
      await wallet.save({ session });

      results.push({ walletId: wallet._id.toString(), oldBalance, newBalance: balance });
    }

    await session.commitTransaction();

    res.status(200).json({
      message: 'All wallet balances reconstructed from ledger',
      totalWalletsProcessed: results.length,
      wallets: results,
    });
  } catch (err: any) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

export { reconstructBalance, reconstructAllWallets };
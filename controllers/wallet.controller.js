import Wallet from "../models/Wallet.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";

export const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId });
  return wallet;
};

export const creditWallet = async (userId, amount, description, orderId) => {
  const wallet = await getOrCreateWallet(userId);
  wallet.balance += amount;
  wallet.totalEarned += amount;
  wallet.transactions.push({ type: "credit", amount, description, orderId, status: "completed" });
  await wallet.save();
  return wallet;
};

// GET /api/wallet
export const getMyWallet = asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet(req.user._id);
  const recentTransactions = [...wallet.transactions].reverse().slice(0, 20);
  res.status(200).json({
    success: true,
    wallet: {
      balance: wallet.balance,
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      recentTransactions,
    },
  });
});

// POST /api/wallet/withdraw
export const requestWithdrawal = asyncHandler(async (req, res, next) => {
  const { amount, upiId, note } = req.body;
  if (!amount || amount < 100) return next(new AppError("Minimum withdrawal is ₹100.", 400));
  if (!upiId?.trim()) return next(new AppError("UPI ID is required.", 400));

  const wallet = await getOrCreateWallet(req.user._id);
  if (wallet.balance < amount)
    return next(new AppError(`Insufficient balance. Available: ₹${wallet.balance.toFixed(2)}`, 400));

  wallet.balance -= amount;
  wallet.totalWithdrawn += amount;
  wallet.transactions.push({
    type: "withdrawal",
    amount,
    description: `Withdrawal to UPI: ${upiId}${note ? ` — ${note}` : ""}`,
    status: "pending",
    withdrawalId: `WD-${Date.now()}`,
  });
  await wallet.save();

  res.status(200).json({
    success: true,
    message: `Withdrawal of ₹${amount} submitted. Processed within 2–3 business days.`,
    balance: wallet.balance,
  });
});

// GET /api/wallet/admin/all
export const getAllWallets = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const [wallets, total] = await Promise.all([
    Wallet.find()
      .populate("user", "name email role")
      .select("balance totalEarned totalWithdrawn user updatedAt")
      .sort({ totalEarned: -1 })
      .skip(skip).limit(Number(limit)),
    Wallet.countDocuments(),
  ]);
  const totalHeld = wallets.reduce((s, w) => s + w.balance, 0);
  res.status(200).json({
    success: true, wallets, totalHeld,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

// GET /api/wallet/admin/withdrawals
export const getPendingWithdrawals = asyncHandler(async (req, res) => {
  const wallets = await Wallet.find({
    "transactions.status": "pending",
    "transactions.type": "withdrawal",
  }).populate("user", "name email");

  const pending = [];
  wallets.forEach((wallet) => {
    wallet.transactions
      .filter((t) => t.type === "withdrawal" && t.status === "pending")
      .forEach((t) => {
        pending.push({
          walletId: wallet._id,
          userId: wallet.user._id,
          userName: wallet.user.name,
          userEmail: wallet.user.email,
          transactionId: t._id,
          amount: t.amount,
          description: t.description,
          withdrawalId: t.withdrawalId,
          requestedAt: t.createdAt,
        });
      });
  });
  pending.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  res.status(200).json({ success: true, count: pending.length, withdrawals: pending });
});

// PATCH /api/wallet/admin/withdrawals/:walletId/:transactionId/complete
export const completeWithdrawal = asyncHandler(async (req, res, next) => {
  const wallet = await Wallet.findById(req.params.walletId);
  if (!wallet) return next(new AppError("Wallet not found.", 404));
  const txn = wallet.transactions.id(req.params.transactionId);
  if (!txn) return next(new AppError("Transaction not found.", 404));
  if (txn.status !== "pending") return next(new AppError("Not pending.", 400));
  txn.status = "completed";
  await wallet.save();
  res.status(200).json({ success: true, message: "Withdrawal completed." });
});

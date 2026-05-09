import express from "express";
import { getMyWallet, requestWithdrawal, getAllWallets, getPendingWithdrawals, completeWithdrawal } from "../controllers/wallet.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, authorizeRoles("creator", "admin"), getMyWallet);
router.post("/withdraw", protect, authorizeRoles("creator"), requestWithdrawal);
router.get("/admin/all", protect, authorizeRoles("admin"), getAllWallets);
router.get("/admin/withdrawals", protect, authorizeRoles("admin"), getPendingWithdrawals);
router.patch("/admin/withdrawals/:walletId/:transactionId/complete", protect, authorizeRoles("admin"), completeWithdrawal);

export default router;

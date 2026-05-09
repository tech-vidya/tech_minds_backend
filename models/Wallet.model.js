import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["credit","debit","withdrawal","refund_deduction"], required: true },
    amount: { type: Number, required: true },
    description: { type: String, default: "" },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    withdrawalId: { type: String },
    status: { type: String, enum: ["completed","pending","failed"], default: "completed" },
  },
  { timestamps: true }
);

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    transactions: [transactionSchema],
  },
  { timestamps: true }
);

walletSchema.index({ user: 1 });
export default mongoose.model("Wallet", walletSchema);

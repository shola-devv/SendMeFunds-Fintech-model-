import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IWallet extends Document {
  userId: mongoose.Types.ObjectId;
  balance: number;
  currency: string;
  pin: string | null;
  comparePin(enteredPin: string): Promise<boolean>;
}

const WalletSchema: Schema<IWallet> = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    balance: {
      type: Number,
      default: 0,
    },

    currency: {
      type: String,
      default: "NGN",
    },

    pin: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

// Hash PIN before saving
WalletSchema.pre("save", async function (next) {
  if (!this.isModified("pin")) return next();

  const salt = await bcrypt.genSalt(10);
  this.pin = await bcrypt.hash(this.pin as string, salt);

  next();
});

// Compare PIN
WalletSchema.methods.comparePin = async function (enteredPin: string) {
  if (!this.pin) return false;
  return await bcrypt.compare(enteredPin, this.pin);
};

export default mongoose.model<IWallet>("Wallet", WalletSchema);
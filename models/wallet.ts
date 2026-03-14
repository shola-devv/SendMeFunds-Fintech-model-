import mongoose, { Schema, Document } from "mongoose"

export interface IWallet extends Document {
  userId: mongoose.Types.ObjectId
  balance: number
  currency: string
  createdAt: Date
}

const WalletSchema: Schema<IWallet> = new Schema({

  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  balance: {
    type: Number,
    default: 0
  },

  currency: {
    type: String,
    default: "NGN"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

})

export default mongoose.model<IWallet>("Wallet", WalletSchema)
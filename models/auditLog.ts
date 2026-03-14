
import mongoose, { Schema, Document } from "mongoose"

export interface IAuditLog extends Document {
  action: string
  userId: mongoose.Types.ObjectId
  walletId: mongoose.Types.ObjectId
  amount: number
  status: "success" | "fail"
  reference: string
  timestamp: Date
}

const AuditLogSchema: Schema<IAuditLog> = new Schema({

  action: {
    type: String,
    required: true
  },

  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  walletId: {
    type: Schema.Types.ObjectId,
    ref: "Wallet",
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  status: {
    type: String,
    enum: ["success", "fail"],
    required: true
  },

  reference: {
    type: String,
    required: true
  },

  timestamp: {
    type: Date,
    default: Date.now
  }

})

export default mongoose.model<IAuditLog>("AuditLog", AuditLogSchema)


import mongoose, { Schema, Document } from "mongoose";

interface IIdempotencyKey extends Document {
  key: string
  response?: object
  createdAt: Date
}

const IdempotencyKeySchema: Schema<IIdempotencyKey> = new Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },

  response: {
    type: Object
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
})

export default mongoose.model<IIdempotencyKey>(
  "IdempotencyKey",
  IdempotencyKeySchema
)
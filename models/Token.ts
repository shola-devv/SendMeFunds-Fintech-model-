import mongoose, { Document, Schema } from 'mongoose';

interface IToken extends Document {
  user: string;
  refreshToken: string;
  isValid: boolean;
  createdAt: Date;
}

const TokenSchema = new Schema<IToken>({
  user: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  isValid: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Token = mongoose.model<IToken>('Token', TokenSchema);

export default Token;
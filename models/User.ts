
import mongoose, { Schema, Document } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";  // ← ADD THIS

export interface IUser extends Document {
  name: string;
  email: string;
  phone: string;
  createdAt: Date;
  password: string;
  role: "user" | "admin" | "super-admin";
  comparePassword(password: string): Promise<boolean>;
  createJWT(): string;
}

const UserSchema: Schema<IUser> = new Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  phone:     { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  password:  { type: String, required: true },
  role:      { type: String, enum: ["user", "admin", "super-admin"], default: "user" },
});

// JWT method
UserSchema.methods.createJWT = function (): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");

  const expiresIn = (process.env.JWT_EXPIRES_IN || "1d") as jwt.SignOptions["expiresIn"]; // ← CAST HERE

  return jwt.sign(
    { userId: this._id.toString(), role: this.role },
    secret,
    { expiresIn }
  );
};

// Compare password method
UserSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
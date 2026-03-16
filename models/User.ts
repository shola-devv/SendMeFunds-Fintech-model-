 import mongoose, { Schema, Document } from "mongoose";
 import jwt from "jsonwebtoken";

export interface IUser extends Document {
  name: string
  email: string
  phone: string
  createdAt: Date
  password: string
  role: "user" | "admin" | "super-admin";
  comparePassword(password: string): Promise<boolean>;
  createJWT(): string;
}

const UserSchema: Schema<IUser> = new Schema({
  name: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  phone: {
    type: String,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  password: {
    type: String,
    required: true
  },

  role: { 
   type: String, 
   enum: ["user", "admin", "super-admin"], 
   default: "user" },
})

// JWT method
UserSchema.methods.createJWT = function() {
  return jwt.sign(
    { userId: this._id, role: this.role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
};

// Compare password method
UserSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  const bcrypt = require('bcryptjs');
  const isPasswordCorrect = await bcrypt.compare(password, this.password);
  return isPasswordCorrect;
};


export default mongoose.model<IUser>("User", UserSchema)
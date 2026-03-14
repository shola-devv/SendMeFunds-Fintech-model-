 import mongoose, { Schema, Document } from "mongoose";
 import jwt from "jsonwebtoken";

export interface IUser extends Document {
  name: string
  email: string
  phone: string
  createdAt: Date
  role: "user" | "admin" | "super-admin";
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
    { expiresIn: process.env.JWT_EXPIRES_IN || "1m" }
  );
};


export default mongoose.model<IUser>("User", UserSchema)
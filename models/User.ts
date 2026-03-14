 import mongoose, { Schema, Document } from "mongoose";

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

export default mongoose.model<IUser>("User", UserSchema)
import mongoose from 'mongoose';

const connectDB = async (url: string) => {
  return mongoose.connect(url);
};

export default connectDB;
 
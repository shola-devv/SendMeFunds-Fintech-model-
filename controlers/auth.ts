import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Token from '../models/Token';
import { UnauthenticatedError, UnauthorizedError, CustomError } from '../errors';
import { attachCookiesToResponse } from '../utils';

const register = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Please provide all required fields' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
    });

    const token = user.createJWT();

    res.status(201).json({
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        token,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid Credentials' });
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ error: 'Invalid Credentials' });
    }

    const token = user.createJWT();
    
    // Create/update token in database
    await Token.findOneAndUpdate(
      { user: user._id },
      { user: user._id, refreshToken: token, isValid: true },
      { upsert: true }
    );

    attachCookiesToResponse({
      res,
      user: { userId: user._id as string, role: user.role },
      refreshToken: token,
    });

    res.status(200).json({
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        token,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

const logout = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(400).json({ error: 'User not authenticated' });
    }

    await Token.findOneAndUpdate(
      { user: userId },
      { isValid: false }
    );

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

const updateUser = async (req: Request, res: Response) => {
  try {
    const { name, email, phone } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Please provide all values' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.name = name;
    user.email = email;
    user.phone = phone;

    await user.save();
    const token = user.createJWT();

    res.status(200).json({
      user: {
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        token,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Also delete associated tokens
    await Token.deleteMany({ user: userId });

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

// Instantiate super admin
const createSuper = async () => {
  try {
    if (!process.env.SUPERADMIN_EMAIL1 || !process.env.SUPERADMIN_PASSWORD1) {
      console.warn('⚠️  SUPERADMIN_EMAIL1 or PASSWORD1 not set');
      return;
    }

    const existingAdmin1 = await User.findOne({ email: process.env.SUPERADMIN_EMAIL1 });
    if (!existingAdmin1) {
      const hashed = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD1, 10);
      await User.create({
        name: 'Super Admin 1',
        email: process.env.SUPERADMIN_EMAIL1,
        phone: process.env.SUPERADMIN_PHONE1 || '0000000000',
        password: hashed,
        role: 'super-admin',
      });
      console.log('✅ Super Admin 1 created');
    } else {
      console.log('ℹ️  Super Admin 1 already exists');
    }

    if (process.env.SUPERADMIN_EMAIL2 && process.env.SUPERADMIN_PASSWORD2) {
      const superAdminCount = await User.countDocuments({ role: 'super-admin' });

      if (superAdminCount < 2) {
        const existingAdmin2 = await User.findOne({ email: process.env.SUPERADMIN_EMAIL2 });
        if (!existingAdmin2) {
          const hashed2 = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD2, 10);
          await User.create({
            name: 'Super Admin 2',
            email: process.env.SUPERADMIN_EMAIL2,
            phone: process.env.SUPERADMIN_PHONE2 || '0000000000',
            password: hashed2,
            role: 'super-admin',
          });
          console.log('✅ Super Admin 2 created');
        } else {
          console.log('ℹ️  Super Admin 2 already exists');
        }
      } else {
        console.log('ℹ️  Already 2 super-admins, skipping Super Admin 2 creation');
      }
    }
  } catch (err) {
    console.error('❌ Error creating super admin(s):', err);
  }
};

export { register, login, logout, updateUser, deleteUser, createSuper };

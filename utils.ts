import jwt from 'jsonwebtoken';
import { Response } from 'express';
import crypto from 'crypto';
import Token from './models/Token';

interface User {
  userId: string;
  role: string;
}

interface Payload {
  user: User;
}

export const isTokenValid = (token: string): Payload => {
  return jwt.verify(token, process.env.JWT_SECRET!) as Payload;
};

export const attachCookiesToResponse = async ({ res, user, refreshToken }: { res: Response; user: User; refreshToken?: string }) => {
  const accessTokenJWT = jwt.sign({ user }, process.env.JWT_SECRET!, { expiresIn: '15m' });

  let refreshTokenValue = refreshToken;
  if (!refreshTokenValue) {
    refreshTokenValue = crypto.randomBytes(40).toString('hex');
    await Token.findOneAndUpdate(
      { user: user.userId },
      { user: user.userId, refreshToken: refreshTokenValue, isValid: true },
      { upsert: true }
    );
  }

  res.cookie('accessToken', accessTokenJWT, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', refreshTokenValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};
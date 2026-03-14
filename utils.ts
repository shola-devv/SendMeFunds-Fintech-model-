import jwt from 'jsonwebtoken';
import { Response } from 'express';

interface User {
  userId: string;
  role: string;
}

interface Payload {
  user: User;
  refreshToken?: string;
}

export const isTokenValid = (token: string): Payload => {
  return jwt.verify(token, process.env.JWT_SECRET!) as Payload;
};

export const attachCookiesToResponse = ({ res, user, refreshToken }: { res: Response; user: User; refreshToken: string }) => {
  const accessTokenJWT = jwt.sign({ user }, process.env.JWT_SECRET!, { expiresIn: '15m' });
  const refreshTokenJWT = jwt.sign({ user, refreshToken }, process.env.JWT_SECRET!, { expiresIn: '30d' });

  res.cookie('accessToken', accessTokenJWT, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', refreshTokenJWT, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};
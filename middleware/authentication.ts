import { Request, Response, NextFunction } from 'express';
import { CustomError, UnauthenticatedError, UnauthorizedError } from '../errors';
import { isTokenValid, attachCookiesToResponse } from '../utils';
import Token from '../models/Token';

const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  const accessToken = req.signedCookies?.accessToken || req.cookies?.accessToken;
  const refreshToken = req.signedCookies?.refreshToken || req.cookies?.refreshToken;

  try {
    if (accessToken) {
      const payload = isTokenValid(accessToken);
      req.user = payload.user;
      return next();
    }

    // If no access token, check refresh token from DB
    if (refreshToken) {
      const existingToken = await Token.findOne({
        refreshToken,
        isValid: true,
      });

      if (!existingToken) {
        throw new UnauthenticatedError('Authentication Invalid');
      }

      // Get user details
      const User = require('../models/User');
      const user = await User.findById(existingToken.user);
      if (!user) {
        throw new UnauthenticatedError('Authentication Invalid');
      }

      // Generate new access token and refresh cookies
      await attachCookiesToResponse({
        res,
        user: { userId: user._id.toString(), role: user.role },
        refreshToken: existingToken.refreshToken,
      });

      req.user = { userId: user._id.toString(), role: user.role };
      return next();
    }

    throw new UnauthenticatedError('Authentication Invalid');
  } catch (error) {
    throw new UnauthenticatedError('Authentication Invalid');
  }
};

const authorizePermissions = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user!.role)) {
      throw new UnauthorizedError(
        'Unauthorized to access this route'
      );
    }
    next();
  };
};

export {
  authenticateUser,
  authorizePermissions,
};
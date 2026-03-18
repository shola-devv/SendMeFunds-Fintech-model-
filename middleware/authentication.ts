 import { Request, Response, NextFunction } from 'express';
import { UnauthenticatedError, UnauthorizedError } from '../errors';
import { isTokenValid, attachCookiesToResponse } from '../utils';
import Token from '../models/Token';

// Define user payload type locally
interface UserPayload {
  userId: string;
  role: string;
}

// Extend Request type locally
interface AuthRequest extends Request {
  user?: UserPayload;
}

const authenticateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const accessToken = req.signedCookies?.accessToken || req.cookies?.accessToken;
  const refreshToken = req.signedCookies?.refreshToken || req.cookies?.refreshToken;

  try {
    if (accessToken) {
      const payload = isTokenValid(accessToken);
      req.user = payload.user;
      return next();
    }

    if (refreshToken) {
      const existingToken = await Token.findOne({
        refreshToken,
        isValid: true,
      });

      if (!existingToken) {
        throw new UnauthenticatedError('Authentication Invalid');
      }

      const User = require('../models/User');
      const user = await User.findById(existingToken.user);
      if (!user) {
        throw new UnauthenticatedError('Authentication Invalid');
      }

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
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user!.role)) {
      throw new UnauthorizedError('Unauthorized to access this route');
    }
    next();
  };
};

export { authenticateUser, authorizePermissions };
export type { UserPayload, AuthRequest };  // export so other files can reuse
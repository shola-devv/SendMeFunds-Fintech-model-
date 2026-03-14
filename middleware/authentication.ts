import { Request, Response, NextFunction } from 'express';
import { CustomError, UnauthenticatedError, UnauthorizedError } from '../errors';
import { isTokenValid, attachCookiesToResponse } from '../utils';
import Token from '../models/Token';

const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  const { refreshToken, accessToken } = req.signedCookies;

  try {
    if (accessToken) {
      const payload = isTokenValid(accessToken);
      req.user = payload.user;
      return next();
    }
    const payload = isTokenValid(refreshToken);

    const existingToken = await Token.findOne({
      user: payload.user.userId,
      refreshToken: payload.refreshToken,
    });

    if (!existingToken || !existingToken?.isValid) {
      throw new UnauthenticatedError('Authentication Invalid');
    }

    attachCookiesToResponse({
      res,
      user: payload.user,
      refreshToken: existingToken.refreshToken,
    });

    req.user = payload.user;
    next();
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
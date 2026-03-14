import { Request, Response, NextFunction } from 'express';
import { UnauthenticatedError, UnauthorizedError } from '../errors';
import { isTokenValid } from '../utils';

const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1]; // Assuming Bearer token

  if (!token) {
    throw new UnauthenticatedError('Authentication invalid');
  }
  try {
    const payload = isTokenValid(token);

    // Attach the user and his permissions to the req object
    req.user = {
      userId: payload.user.userId,
      role: payload.user.role,
    };

    next();
  } catch (error) {
    throw new UnauthenticatedError('Authentication invalid');
  }
};

const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user!.role)) {
      throw new UnauthorizedError(
        'Unauthorized to access this route'
      );
    }
    next();
  };
};

export { authenticateUser, authorizeRoles };
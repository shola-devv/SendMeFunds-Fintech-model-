export class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomError';
  }
}

export class UnauthenticatedError extends CustomError {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export class UnauthorizedError extends CustomError {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
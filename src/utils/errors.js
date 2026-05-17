// Centralized error codes for consistent API responses
export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  NOT_FOUND: 'NOT_FOUND',

  // Business
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  ENROLLMENT_EXISTS: 'ENROLLMENT_EXISTS',
  INVALID_OPERATION: 'INVALID_OPERATION',

  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DB_ERROR: 'DB_ERROR',
};

export class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.code = code || (statusCode === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.INTERNAL_ERROR);
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const sendSuccess = (res, data, statusCode = 200, meta = {}) => {
  const response = { success: true, data };
  if (Object.keys(meta).length) response.meta = meta;
  return res.status(statusCode).json(response);
};

export const sendPaginated = (res, data, total, page, limit) => {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  });
};

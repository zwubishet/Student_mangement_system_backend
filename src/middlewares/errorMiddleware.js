import { AppError, ERROR_CODES } from '../utils/errors.js';

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again.', 401, ERROR_CODES.TOKEN_INVALID);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired. Please log in again.', 401, ERROR_CODES.TOKEN_EXPIRED);

const handlePgUniqueViolation = (err) => {
  const match = err.detail?.match(/Key \((.+?)\)=\((.+?)\)/);
  const field = match ? match[1] : 'field';
  return new AppError(`${field} already exists.`, 409, ERROR_CODES.DUPLICATE_ENTRY);
};

const handlePgForeignKeyViolation = () =>
  new AppError('Referenced record does not exist.', 400, ERROR_CODES.INVALID_OPERATION);

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    code: err.code,
    message: err.message,
    ...(err.details ? { details: err.details } : {}),
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
    });
  } else {
    console.error('UNEXPECTED ERROR:', err);
    res.status(500).json({
      success: false,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Something went wrong. Please try again later.',
    });
  }
};

export const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  let error = { ...err, message: err.message, stack: err.stack };

  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
  if (err.code === '23505') error = handlePgUniqueViolation(err);
  if (err.code === '23503') error = handlePgForeignKeyViolation();

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

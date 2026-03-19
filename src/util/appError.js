class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Used to identify trusted errors

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
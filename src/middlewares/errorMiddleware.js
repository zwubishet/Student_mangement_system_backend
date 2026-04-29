export const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  const isProd = process.env.NODE_ENV === 'production';

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    ...(isProd ? {} : { stack: err.stack })
  });
};

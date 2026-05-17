import { AppError, ERROR_CODES } from '../utils/errors.js';

/**
 * Middleware factory: validates req.body against a Joi schema.
 * Usage: router.post('/path', validate(schema), controller)
 */
export const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const details = error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));
    const err = new AppError('Validation failed', 422, ERROR_CODES.VALIDATION_ERROR);
    err.details = details;
    return next(err);
  }

  req.body = value;
  next();
};

/**
 * Validate query params (for list/filter endpoints)
 */
export const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    const details = error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));
    const err = new AppError('Invalid query parameters', 422, ERROR_CODES.VALIDATION_ERROR);
    err.details = details;
    err.message = details.length
      ? `Invalid query parameters: ${details.map((d) => d.field).join(', ')}`
      : err.message;
    return next(err);
  }

  req.query = value;
  next();
};

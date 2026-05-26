import { AppError } from '../utils/errors.js';

/** Role gate for tenant-scoped REST routes (no DB/Redis side effects). */
export const requireRole = (...roles) => (req, res, next) => {
  if (req.tenant?.isPlatformManage) {
    return next();
  }
  const userRoles = req.tenant?.roles || [];
  if (!roles.some((role) => userRoles.includes(role))) {
    return next(new AppError('You do not have access to this resource.', 403));
  }
  next();
};

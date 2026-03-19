import * as authService from '../../services/authService.js';
import { loginSchema } from '../../util/validators.js';
import catchAsync from '../../util/catchAsync.js';
import AppError from '../../util/appError.js';

export const login = catchAsync(async (req, res, next) => {
  // 1. Validate Input
  const { error, value } = loginSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  // 2. Authenticate via Service
  const result = await authService.loginUser(value.email, value.password);

  // 3. Send Response
  res.status(200).json({
    status: 'success',
    token: result.token,
    data: {
      user: result.user
    }
  });
});
import * as authService from '../../services/authService.js';
import { signupSchema } from '../../utils/validators.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const registerSchool = catchAsync(async (req, res, next) => {
  // 1. Validate Input
  const { error, value } = signupSchema.validate(req.body);
  if (error) {
    return next(new AppError(error.details[0].message, 400));
  }

  // 2. Call Service (Business Logic)
  const result = await authService.registerSchoolAndAdmin(value);

  // 3. Response
  res.status(201).json({
    status: 'success',
    message: 'School and Admin account created successfully',
    token: result.token,
    data: {
      user: result.user,
      schoolId: result.schoolId
    }
  });
});
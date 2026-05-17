import * as authService from '../../services/authService.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';
import { sendSuccess } from '../../utils/errors.js';

export const login = catchAsync(async (req, res, next) => {
  // 1. Validate Input
  const { input } = req.body;
  const { email, password } = input.object;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // 2. Call your existing high-scale login logic
  const result = await authService.loginUser(email, password);

  console.log('Login result:', result); // Debugging log

  // 3. Return response exactly matching LoginOutput type
  res.json({
    id: result.user.id,
    token: result.token,
    email: result.user.email,
    first_name: result.user.firstName, // Check if service uses firstName
    last_name: result.user.lastName,   // This was the missing field!
    school_id: result.user.schoolId,
    roles: result.user.roles
  });
});

/** Direct REST login for the SaaS dashboard (no Hasura action wrapper). */
export const loginSession = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }
  const result = await authService.loginUser(email, password);
  sendSuccess(res, {
    id: result.user.id,
    token: result.token,
    email: result.user.email,
    first_name: result.user.firstName,
    last_name: result.user.lastName,
    school_id: result.user.schoolId,
    roles: result.user.roles,
  });
});
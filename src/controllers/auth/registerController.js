import * as authService from '../../services/authService.js';
import { signupSchema } from '../../utils/validators.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const registerSchool = catchAsync(async (req, res, next) => {
  // Hasura Actions wrap the input in an 'input' object
  const { input } = req.body;
  const registrationData = input.object;

  const result = await authService.registerSchoolAndAdmin(registrationData);

  res.json({
    school_id: result.schoolId,
    admin_id: result.userId,
    token: result.token
  });
});
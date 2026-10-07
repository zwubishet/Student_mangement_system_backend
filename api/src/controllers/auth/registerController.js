import * as authService from '../../services/auth/authService.js';
import { toRegisterSchoolOutput } from '../../services/auth/authPresenter.js';
import catchAsync from '../../utils/catchAsync.js';

export const registerSchool = catchAsync(async (req, res) => {
  const registrationData = req.hasuraInput;
  const result = await authService.registerSchoolAndAdmin(registrationData);
  res.status(200).json(toRegisterSchoolOutput(result));
});

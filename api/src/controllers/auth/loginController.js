import * as authService from '../../services/auth/authService.js';
import { toLoginOutput } from '../../services/auth/authPresenter.js';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import { isHasuraActionRequest } from '../../utils/hasuraAction.js';

const performLogin = async (email, password) => authService.loginUser(email, password);

/** Hasura LoginAction — returns GraphQL LoginOutput (flat JSON). */
export const loginHasuraAction = catchAsync(async (req, res) => {
  const { email, password } = req.hasuraInput;
  const result = await performLogin(email, password);
  res.status(200).json(toLoginOutput(result));
});

/** REST session login for SPA / mobile admin apps. */
export const loginSession = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const result = await performLogin(email, password);
  sendSuccess(res, toLoginOutput(result));
});

/** @deprecated Use loginHasuraAction — kept for route alias compatibility. */
export const login = loginHasuraAction;

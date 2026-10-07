import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import { revokeAccessToken } from '../../services/auth/tokenRevocationService.js';
import { toLogoutOutput } from '../../services/auth/authPresenter.js';
import { isHasuraActionRequest } from '../../utils/hasuraAction.js';

export const logout = catchAsync(async (req, res) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : null;

  if (token) {
    await revokeAccessToken(token);
  }

  const payload = toLogoutOutput();
  if (isHasuraActionRequest(req)) {
    return res.status(200).json(payload);
  }
  return sendSuccess(res, payload);
});

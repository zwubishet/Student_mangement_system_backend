import catchAsync from '../utils/catchAsync.js';
import { sendSuccess } from '../utils/errors.js';
import * as parentPortal from '../services/parentPortalService.js';

export const dashboard = catchAsync(async (req, res) => {
  sendSuccess(res, await parentPortal.getParentChildren(req.tenant.schoolId, req.tenant.userId));
});

export const childDetail = catchAsync(async (req, res) => {
  sendSuccess(res, await parentPortal.getParentChildDetail(req.tenant.schoolId, req.tenant.userId, req.params.studentId));
});

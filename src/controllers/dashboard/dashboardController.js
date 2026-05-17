import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import * as dashboardService from '../../services/dashboardService.js';

export const getStats = catchAsync(async (req, res) => {
  const stats = await dashboardService.getDashboardStats(req.tenant.schoolId);
  sendSuccess(res, stats);
});

export const getActivity = catchAsync(async (req, res) => {
  const activity = await dashboardService.getRecentActivity(req.tenant.schoolId);
  sendSuccess(res, activity);
});

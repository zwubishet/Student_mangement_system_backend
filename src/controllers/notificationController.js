import catchAsync from '../utils/catchAsync.js';
import { sendSuccess } from '../utils/errors.js';
import * as notification from '../services/notificationService.js';

export const list = catchAsync(async (req, res) => {
  sendSuccess(res, await notification.listNotifications(req.tenant.schoolId, req.query));
});

export const sendSms = catchAsync(async (req, res) => {
  const row = await notification.queueSms(req.tenant.schoolId, req.body, req.tenant.userId);
  const processed = await notification.processOutbox(req.tenant.schoolId, 1);
  sendSuccess(res, { queued: row, processed }, 201);
});

export const notifyGuardians = catchAsync(async (req, res) => {
  sendSuccess(res, await notification.notifyStudentGuardians(
    req.tenant.schoolId,
    req.params.studentId,
    req.body.message,
    req.tenant.userId
  ));
});

export const processQueue = catchAsync(async (req, res) => {
  sendSuccess(res, await notification.processOutbox(req.tenant.schoolId, req.body.limit || 50));
});

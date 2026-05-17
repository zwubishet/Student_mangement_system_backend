import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as settingsService from '../../services/settingsService.js';

export const getSettings = catchAsync(async (req, res) => {
  const settings = await settingsService.getSchoolSettings(req.tenant.schoolId);
  sendSuccess(res, settings);
});

export const updateSettings = catchAsync(async (req, res) => {
  const settings = await settingsService.updateSchoolSettings(req.tenant.schoolId, req.body, req.tenant.userId);
  sendSuccess(res, settings);
});

export const listGradeScales = catchAsync(async (req, res) => {
  const scales = await settingsService.listGradeScales(req.tenant.schoolId);
  sendSuccess(res, scales);
});

export const createGradeScale = catchAsync(async (req, res) => {
  const scale = await settingsService.createGradeScale(req.tenant.schoolId, req.body, req.tenant.userId);
  sendSuccess(res, scale, 201);
});

export const deleteGradeScale = catchAsync(async (req, res) => {
  await settingsService.deleteGradeScale(req.tenant.schoolId, req.params.id, req.tenant.userId);
  sendSuccess(res, { deleted: true });
});

export const listUsers = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await settingsService.listUsers(req.tenant.schoolId, req.query);
  sendPaginated(res, rows, total, page, limit);
});

export const toggleUserStatus = catchAsync(async (req, res) => {
  const result = await settingsService.toggleUserStatus(req.tenant.schoolId, req.params.id, req.tenant.userId);
  sendSuccess(res, result);
});

import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import * as staffService from '../../services/staffService.js';

export const expiringLicences = catchAsync(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 90;
  sendSuccess(res, await staffService.listExpiringLicences(req.tenant.schoolId, days));
});

export const listContracts = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.listStaffContracts(req.tenant.schoolId, req.params.id));
});

export const createContract = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.createStaffContract(
    req.tenant.schoolId, req.params.id, req.body, req.tenant.userId
  ), 201);
});

export const listLeave = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.listStaffLeave(req.tenant.schoolId, req.params.id));
});

export const createLeave = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.createStaffLeave(
    req.tenant.schoolId, req.params.id, req.body, req.tenant.userId
  ), 201);
});

export const updateLeaveStatus = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.updateStaffLeaveStatus(
    req.tenant.schoolId, req.params.id, req.params.leaveId, req.body, req.tenant.userId
  ));
});

export const listAppraisals = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.listStaffAppraisals(req.tenant.schoolId, req.params.id));
});

export const createAppraisal = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.createStaffAppraisal(
    req.tenant.schoolId, req.params.id, req.body, req.tenant.userId
  ), 201);
});

export const listCpd = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.listStaffCpd(req.tenant.schoolId, req.params.id));
});

export const createCpd = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.createStaffCpd(
    req.tenant.schoolId, req.params.id, req.body, req.tenant.userId
  ), 201);
});

export const verifyCpd = catchAsync(async (req, res) => {
  sendSuccess(res, await staffService.verifyStaffCpd(
    req.tenant.schoolId, req.params.id, req.params.cpdId, req.tenant.userId
  ));
});

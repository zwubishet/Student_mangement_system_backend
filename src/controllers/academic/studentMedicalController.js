import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import * as medical from '../../services/studentMedicalService.js';

export const get = catchAsync(async (req, res) => {
  sendSuccess(res, await medical.getStudentMedical(req.tenant.schoolId, req.params.id));
});

export const upsert = catchAsync(async (req, res) => {
  sendSuccess(res, await medical.upsertStudentMedical(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId));
});

import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as parentService from '../../services/parentService.js';

export const list = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await parentService.listParents(req.tenant.schoolId, req.query);
  sendPaginated(res, rows, total, page, limit);
});

export const register = catchAsync(async (req, res) => {
  sendSuccess(res, await parentService.registerParent(req.tenant.schoolId, req.body, req.tenant.userId), 201);
});

export const studentParents = catchAsync(async (req, res) => {
  sendSuccess(res, await parentService.getStudentParents(req.tenant.schoolId, req.params.id));
});

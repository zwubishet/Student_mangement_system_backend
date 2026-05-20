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

export const searchParents = catchAsync(async (req, res) => {
  sendSuccess(res, await parentService.searchParents(req.tenant.schoolId, req.query.q));
});

export const searchStudents = catchAsync(async (req, res) => {
  sendSuccess(res, await parentService.searchStudentsForParentLink(req.tenant.schoolId, req.query.q));
});

export const linkStudents = catchAsync(async (req, res) => {
  const { student_ids } = req.body;
  sendSuccess(res, await parentService.linkParentToStudents(
    req.tenant.schoolId,
    req.params.id,
    student_ids || [],
    req.tenant.userId
  ));
});

import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as studentService from '../../services/studentService.js';

export const stats = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.getStudentStats(req.tenant.schoolId));
});

export const list = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await studentService.listStudents(req.tenant.schoolId, req.query);
  sendPaginated(res, rows, total, page, limit);
});

export const exportCsv = catchAsync(async (req, res) => {
  const csv = await studentService.exportStudentsCsv(req.tenant.schoolId, req.query);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
  res.send(csv);
});

export const bulk = catchAsync(async (req, res) => {
  const result = await studentService.bulkStudentAction(req.tenant.schoolId, req.body, req.tenant.userId);
  sendSuccess(res, result);
});

export const importRows = catchAsync(async (req, res) => {
  const result = await studentService.importStudents(req.tenant.schoolId, req.body.rows, req.tenant.userId);
  sendSuccess(res, result);
});

export const getOne = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.getStudentProfile(req.tenant.schoolId, req.params.id));
});

export const create = catchAsync(async (req, res) => {
  const data = req.body.input?.object || req.body;
  const result = await studentService.registerAndEnrollStudent(data, req.tenant.schoolId, req.tenant.userId);
  sendSuccess(res, result, 201);
});

export const update = catchAsync(async (req, res) => {
  const result = await studentService.updateStudent(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId);
  sendSuccess(res, result);
});

export const archive = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.archiveStudent(req.tenant.schoolId, req.params.id, req.tenant.userId));
});

export const restore = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.restoreStudent(req.tenant.schoolId, req.params.id, req.tenant.userId));
});

export const remove = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.softDeleteStudent(req.tenant.schoolId, req.params.id, req.tenant.userId));
});

export const addNote = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.addStudentNote(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId), 201);
});

export const addGuardian = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.addStudentGuardian(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId), 201);
});

export const listTags = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.listSchoolTags(req.tenant.schoolId));
});

export const createTag = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.createSchoolTag(req.tenant.schoolId, req.body, req.tenant.userId), 201);
});

export const assignTag = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.assignStudentTag(req.tenant.schoolId, req.params.id, req.params.tagId, req.tenant.userId));
});

export const removeTag = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.removeStudentTag(req.tenant.schoolId, req.params.id, req.params.tagId, req.tenant.userId));
});

export const addDocument = catchAsync(async (req, res) => {
  sendSuccess(res, await studentService.addStudentDocument(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId), 201);
});

export const registerAndEnrollStudent = catchAsync(async (req, res, next) => {
  const schoolId = req.body.session_variables?.['x-hasura-school-id'];
  const actorId = req.body.session_variables?.['x-hasura-user-id'];
  const data = req.body.input?.object;
  if (!schoolId) return next(new AppError('Unauthorized: School context missing.', 401));
  const result = await studentService.registerAndEnrollStudent(data, schoolId, actorId);
  res.json(result);
});

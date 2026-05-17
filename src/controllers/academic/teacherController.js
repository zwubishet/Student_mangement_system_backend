import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as teacherService from '../../services/teacherService.js';

export const stats = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.getTeacherStats(req.tenant.schoolId));
});

export const list = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await teacherService.listTeachers(req.tenant.schoolId, req.query);
  sendPaginated(res, rows, total, page, limit);
});

export const exportCsv = catchAsync(async (req, res) => {
  const csv = await teacherService.exportTeachersCsv(req.tenant.schoolId, req.query);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=teachers.csv');
  res.send(csv);
});

export const bulk = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.bulkTeacherAction(req.tenant.schoolId, req.body, req.tenant.userId));
});

export const importRows = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.importTeachers(req.tenant.schoolId, req.body.rows, req.tenant.userId));
});

export const getOne = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.getTeacherProfile(req.tenant.schoolId, req.params.id));
});

export const create = catchAsync(async (req, res) => {
  const result = await teacherService.createTeacher(req.body, req.tenant.schoolId, req.tenant.userId);
  sendSuccess(res, result, 201);
});

export const update = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.updateTeacher(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId));
});

export const archive = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.archiveTeacher(req.tenant.schoolId, req.params.id, req.tenant.userId));
});

export const restore = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.restoreTeacher(req.tenant.schoolId, req.params.id, req.tenant.userId));
});

export const remove = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.softDeleteTeacher(req.tenant.schoolId, req.params.id, req.tenant.userId));
});

export const addNote = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.addTeacherNote(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId), 201);
});

export const addQualification = catchAsync(async (req, res) => {
  sendSuccess(res, await teacherService.addTeacherQualification(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId), 201);
});

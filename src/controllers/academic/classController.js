import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as classService from '../../services/classService.js';

export const list = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await classService.listClasses(req.tenant.schoolId, req.query);
  sendPaginated(res, rows, total, page, limit);
});

export const getOne = catchAsync(async (req, res) => {
  const cls = await classService.getClassProfile(req.tenant.schoolId, req.params.id);
  sendSuccess(res, cls);
});

export const create = catchAsync(async (req, res) => {
  const data = req.body.input?.object || req.body;
  const result = await classService.createClass(data, req.tenant.schoolId, req.tenant.userId);
  sendSuccess(res, result, 201);
});

export const assignTeacher = catchAsync(async (req, res) => {
  const result = await classService.assignTeacherToSection(
    req.tenant.schoolId,
    req.params.sectionId,
    req.body,
    req.tenant.userId
  );
  sendSuccess(res, result);
});

/** Hasura Action handler — bulk initialize classes for a grade/year */
export const createClassesBulk = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  const schoolId = session_variables['x-hasura-school-id'];
  const actorId = session_variables['x-hasura-user-id'];

  if (!schoolId) return next(new AppError('Unauthorized: School context missing.', 401));

  const result = await classService.createClassesBulk(input.object, schoolId, actorId);
  res.json(result);
});

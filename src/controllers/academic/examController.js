import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as examService from '../../services/examService.js';

export const list = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await examService.listExams(req.tenant.schoolId, req.query);
  sendPaginated(res, rows, total, page, limit);
});

export const getOne = catchAsync(async (req, res) => {
  const exam = await examService.getExamById(req.tenant.schoolId, req.params.id);
  sendSuccess(res, exam);
});

export const create = catchAsync(async (req, res) => {
  const data = req.body.input?.object || req.body;
  const result = await examService.createExam(data, req.tenant.schoolId, req.tenant.userId);
  sendSuccess(res, result, 201);
});

export const getResults = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await examService.getExamResults(req.tenant.schoolId, req.params.id, req.query);
  sendPaginated(res, rows, total, page, limit);
});

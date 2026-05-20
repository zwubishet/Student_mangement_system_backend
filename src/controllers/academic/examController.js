import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as examService from '../../services/examService.js';
import * as grading from '../../services/examGradingService.js';

export const getOverview = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.getExamOverview(req.tenant.schoolId));
});

export const list = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await examService.listExams(req.tenant.schoolId, req.query);
  sendPaginated(res, rows, total, page, limit);
});

export const getOne = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.getExamById(req.tenant.schoolId, req.params.id));
});

export const create = catchAsync(async (req, res) => {
  const data = req.body.input?.object || req.body;
  const result = await examService.createExam(data, req.tenant.schoolId, req.tenant.userId);
  sendSuccess(res, result, 201);
});

export const update = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.updateExam(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId));
});

export const remove = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.deleteExam(req.tenant.schoolId, req.params.id, req.tenant.userId));
});

export const listSchedules = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.listExamSchedules(req.tenant.schoolId, req.params.id));
});

export const addSchedule = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.addExamSchedule(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId), 201);
});

export const patchSchedule = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.updateExamSchedule(req.tenant.schoolId, req.params.scheduleId, req.body));
});

export const deleteSchedule = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.removeExamSchedule(req.tenant.schoolId, req.params.scheduleId, req.tenant.userId));
});

export const getMarkSheet = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.getMarkEntrySheet(req.tenant.schoolId, req.params.id, req.params.scheduleId));
});

export const submitMarks = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.submitMarks(req.tenant.schoolId, req.params.id, req.params.scheduleId, req.body, req.tenant.userId));
});

export const verifyMarks = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.verifyMarks(req.tenant.schoolId, req.params.id, req.params.scheduleId, req.tenant.userId));
});

export const getResults = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await examService.getExamResults(req.tenant.schoolId, req.params.id, req.query);
  sendPaginated(res, rows, total, page, limit);
});

export const calculateTerm = catchAsync(async (req, res) => {
  sendSuccess(res, await examService.calculateTermResults(req.tenant.schoolId, req.params.termId, req.tenant.userId));
});

export const listGradingScales = catchAsync(async (req, res) => {
  sendSuccess(res, await grading.listGradingScales(req.tenant.schoolId, req.query.exam_id || null));
});

export const upsertGradingScale = catchAsync(async (req, res) => {
  sendSuccess(res, await grading.upsertGradingScale(req.tenant.schoolId, req.body), 201);
});

export const deleteGradingScale = catchAsync(async (req, res) => {
  sendSuccess(res, await grading.deleteGradingScale(req.tenant.schoolId, req.params.scaleId));
});

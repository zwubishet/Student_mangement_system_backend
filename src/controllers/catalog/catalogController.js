import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import * as catalogService from '../../services/catalogService.js';

export const getYears = catchAsync(async (req, res) => {
  const detailed = req.query.detailed === 'true' || req.query.detailed === '1';
  const data = detailed
    ? await catalogService.listAcademicYearsDetailed(req.tenant.schoolId)
    : await catalogService.listAcademicYears(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const createYear = catchAsync(async (req, res) => {
  const data = await catalogService.createAcademicYear(req.tenant.schoolId, req.body);
  sendSuccess(res, data, 201);
});

export const createTerm = catchAsync(async (req, res) => {
  const data = await catalogService.createTerm(req.tenant.schoolId, req.body);
  sendSuccess(res, data, 201);
});

export const getTerms = catchAsync(async (req, res) => {
  const data = await catalogService.listTerms(req.tenant.schoolId, req.query.academic_year_id);
  sendSuccess(res, data);
});

export const getGrades = catchAsync(async (req, res) => {
  const data = await catalogService.listGrades(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const getSections = catchAsync(async (req, res) => {
  const data = await catalogService.listSections(req.tenant.schoolId, req.query.grade_id);
  sendSuccess(res, data);
});

export const getSubjects = catchAsync(async (req, res) => {
  const data = await catalogService.listSubjects(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const getClasses = catchAsync(async (req, res) => {
  const data = await catalogService.listActiveClasses(req.tenant.schoolId, req.query.academic_year_id);
  sendSuccess(res, data);
});

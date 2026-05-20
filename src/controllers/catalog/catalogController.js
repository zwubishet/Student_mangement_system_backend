import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import * as catalogService from '../../services/catalogService.js';

export const getOverview = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.getAcademicStructureOverview(req.tenant.schoolId));
});

export const getYears = catchAsync(async (req, res) => {
  const detailed = req.query.detailed === 'true' || req.query.detailed === '1';
  const data = detailed
    ? await catalogService.listAcademicYearsDetailed(req.tenant.schoolId)
    : await catalogService.listAcademicYears(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const getCurrentYear = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.getCurrentAcademicYear(req.tenant.schoolId));
});

export const createYear = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.createAcademicYear(req.tenant.schoolId, req.body, req.tenant.userId), 201);
});

export const updateYear = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.updateAcademicYear(req.tenant.schoolId, req.params.id, req.body, req.tenant.userId));
});

export const setCurrentYear = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.setCurrentAcademicYear(req.tenant.schoolId, req.params.id));
});

export const deleteYear = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.deleteAcademicYear(req.tenant.schoolId, req.params.id));
});

export const createTerm = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.createTerm(req.tenant.schoolId, req.body, req.tenant.userId), 201);
});

export const getTerms = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.listTerms(req.tenant.schoolId, req.query.academic_year_id));
});

export const getTerm = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.getTerm(req.tenant.schoolId, req.params.id));
});

export const updateTerm = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.updateTerm(req.tenant.schoolId, req.params.id, req.body));
});

export const setCurrentTerm = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.setCurrentTerm(req.tenant.schoolId, req.params.id));
});

export const deleteTerm = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.deleteTerm(req.tenant.schoolId, req.params.id));
});

export const getGrades = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.listGrades(req.tenant.schoolId));
});

export const createGrade = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.createGradeLevel(req.tenant.schoolId, req.body), 201);
});

export const updateGrade = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.updateGradeLevel(req.tenant.schoolId, req.params.id, req.body));
});

export const deleteGrade = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.deleteGradeLevel(req.tenant.schoolId, req.params.id));
});

export const getSections = catchAsync(async (req, res) => {
  const detailed = req.query.detailed === 'true' || req.query.detailed === '1';
  const data = detailed
    ? await catalogService.listSectionsDetailed(req.tenant.schoolId, req.query.grade_id)
    : await catalogService.listSections(req.tenant.schoolId, req.query.grade_id);
  sendSuccess(res, data);
});

export const getSectionById = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.getSection(req.tenant.schoolId, req.params.id));
});

export const createSection = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.createSection(req.tenant.schoolId, req.body), 201);
});

export const updateSection = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.updateSection(req.tenant.schoolId, req.params.id, req.body));
});

export const deleteSection = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.deleteSection(req.tenant.schoolId, req.params.id));
});

export const getSubjects = catchAsync(async (req, res) => {
  const detailed = req.query.detailed === 'true' || req.query.detailed === '1';
  const data = detailed
    ? await catalogService.listSubjectsDetailed(req.tenant.schoolId)
    : await catalogService.listSubjects(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const createSubject = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.createSubject(req.tenant.schoolId, req.body), 201);
});

export const updateSubject = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.updateSubject(req.tenant.schoolId, req.params.id, req.body));
});

export const deleteSubject = catchAsync(async (req, res) => {
  const force = req.query.force === 'true';
  sendSuccess(res, await catalogService.deleteSubject(req.tenant.schoolId, req.params.id, { force }));
});

export const getClasses = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.listActiveClasses(req.tenant.schoolId, req.query.academic_year_id));
});

export const getClassSubjects = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.listClassSubjects(req.tenant.schoolId, req.params.classId));
});

export const addClassSubject = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.addClassSubject(req.tenant.schoolId, req.body), 201);
});

export const bulkClassSubjects = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.bulkAssignSubjectsToClass(req.tenant.schoolId, req.body), 201);
});

export const updateClassSubject = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.updateClassSubject(req.tenant.schoolId, req.params.linkId, req.body));
});

export const removeClassSubject = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.removeClassSubject(req.tenant.schoolId, req.params.linkId));
});

export const getTimetable = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.listTimetableSlots(req.tenant.schoolId, req.query.class_id));
});

export const createTimetableSlot = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.createTimetableSlot(req.tenant.schoolId, req.body), 201);
});

export const deleteTimetableSlot = catchAsync(async (req, res) => {
  sendSuccess(res, await catalogService.deleteTimetableSlot(req.tenant.schoolId, req.params.id));
});

import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import * as lessonPlan from '../../services/planning/lessonPlanService.js';
import * as ca from '../../services/planning/continuousAssessmentService.js';
import * as termReport from '../../services/planning/termReportService.js';

export const overview = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.getPlanningOverview(req.tenant.schoolId, req.query));
});

export const periodConfigs = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.ensurePeriodConfigs(req.tenant.schoolId));
});

export const listAnnual = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.listAnnualPlans(req.tenant.schoolId, req.query));
});

export const getAnnual = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.getAnnualPlan(req.tenant.schoolId, req.params.id));
});

export const saveAnnual = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.upsertAnnualPlan(req.tenant.schoolId, req.body, req.tenant.userId));
});

export const submitAnnual = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.submitAnnualPlan(req.tenant.schoolId, req.params.id));
});

export const reviewAnnual = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.reviewAnnualPlan(
    req.tenant.schoolId,
    req.params.id,
    req.body,
    req.tenant.userId
  ));
});

export const listDaily = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.listDailyPlans(req.tenant.schoolId, req.query));
});

export const getDaily = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.getDailyPlan(req.tenant.schoolId, req.params.id));
});

export const saveDaily = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.upsertDailyPlan(req.tenant.schoolId, req.body, req.tenant.userId));
});

export const markTaught = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.markDailyPlanTaught(req.tenant.schoolId, req.params.id));
});

export const lessonContext = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.getLessonContextForSlot(req.tenant.schoolId, req.query));
});

export const recordCa = catchAsync(async (req, res) => {
  sendSuccess(res, await ca.recordCA(req.tenant.schoolId, req.body, req.tenant.userId), 201);
});

export const bulkCa = catchAsync(async (req, res) => {
  sendSuccess(res, await ca.bulkRecordCA(req.tenant.schoolId, req.body, req.tenant.userId), 201);
});

export const studentCaSummary = catchAsync(async (req, res) => {
  sendSuccess(res, await ca.getStudentCASummary(
    req.tenant.schoolId,
    req.params.studentId,
    req.query.term_id,
    req.query.subject_id
  ));
});

export const sectionCaSheet = catchAsync(async (req, res) => {
  sendSuccess(res, await ca.getSectionCASheet(req.tenant.schoolId, req.query));
});

export const deleteCa = catchAsync(async (req, res) => {
  sendSuccess(res, await ca.deleteCAEntry(req.tenant.schoolId, req.params.id));
});

export const teacherAssignments = catchAsync(async (req, res) => {
  const teacherId = req.query.teacher_id || req.tenant.userId;
  sendSuccess(res, await lessonPlan.getTeacherAssignments(req.tenant.schoolId, teacherId, req.query));
});

export const behindSchedule = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.getBehindScheduleReport(req.tenant.schoolId, req.query));
});

export const getUnit = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.getUnitPlan(req.tenant.schoolId, req.params.unitId));
});

export const saveWeekly = catchAsync(async (req, res) => {
  sendSuccess(res, await lessonPlan.saveWeeklyPlansForUnit(
    req.tenant.schoolId,
    req.params.unitId,
    req.body.weeks || []
  ));
});

export const termReportCards = catchAsync(async (req, res) => {
  sendSuccess(res, await termReport.getSectionTermReportCards(req.tenant.schoolId, req.query));
});

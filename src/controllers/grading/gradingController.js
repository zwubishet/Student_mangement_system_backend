import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import * as gradingScale from '../../services/grading/gradingScaleService.js';
import * as examTypeService from '../../services/grading/examTypeService.js';
import * as scheduleConflicts from '../../services/grading/scheduleConflictService.js';
import * as markReview from '../../services/grading/markReviewService.js';
import * as computation from '../../services/grading/computationService.js';
import * as markBulk from '../../services/grading/markBulkService.js';
import * as resultsService from '../../services/grading/resultsService.js';
import { guardTeacherExamRoute } from '../../services/grading/examAccessService.js';
import { buildStudentReportCardPdf } from '../../services/reportCardPdfService.js';
import { sendPaginated } from '../../utils/errors.js';

const staffGuard = async (req, examId, scheduleId = null) => {
  await guardTeacherExamRoute(req.tenant.schoolId, req.tenant.role, req.tenant.userId, examId, scheduleId);
};

export const getActiveScale = catchAsync(async (req, res) => {
  sendSuccess(res, await gradingScale.getActiveScaleWithBands(req.tenant.schoolId));
});

export const createScaleProfile = catchAsync(async (req, res) => {
  const result = await gradingScale.createScaleProfile(
    req.tenant.schoolId,
    req.body,
    req.tenant.userId
  );
  sendSuccess(res, result, 201);
});

export const activateScale = catchAsync(async (req, res) => {
  sendSuccess(res, await gradingScale.activateProfile(req.tenant.schoolId, req.params.id));
});

export const listScaleProfiles = catchAsync(async (req, res) => {
  sendSuccess(res, await gradingScale.listProfiles(req.tenant.schoolId));
});

export const previewGrade = catchAsync(async (req, res) => {
  const score = Number(req.query.score);
  const max = Number(req.query.max_score) || 100;
  sendSuccess(res, await gradingScale.previewGrade(req.tenant.schoolId, score, max));
});

export const listExamTypes = catchAsync(async (req, res) => {
  sendSuccess(res, await examTypeService.listExamTypes(req.tenant.schoolId));
});

export const getTermWeights = catchAsync(async (req, res) => {
  const subjectId = req.query.subject_id || null;
  sendSuccess(res, await examTypeService.getTermWeights(req.tenant.schoolId, req.params.termId, subjectId));
});

export const setTermWeights = catchAsync(async (req, res) => {
  const { subject_id: subjectId, weights } = req.body;
  sendSuccess(
    res,
    await examTypeService.upsertTermWeights(
      req.tenant.schoolId,
      req.params.termId,
      subjectId || null,
      weights,
      req.tenant.userId
    )
  );
});

export const checkConflicts = catchAsync(async (req, res) => {
  sendSuccess(res, await scheduleConflicts.checkScheduleConflicts(req.tenant.schoolId, req.query));
});

export const markEntryProgress = catchAsync(async (req, res) => {
  await staffGuard(req, req.params.examId, req.params.scheduleId);
  sendSuccess(
    res,
    await markReview.getMarkEntryProgress(
      req.tenant.schoolId,
      req.params.examId,
      req.params.scheduleId
    )
  );
});

export const markReviewOverview = catchAsync(async (req, res) => {
  sendSuccess(res, await markReview.getMarkReviewOverview(req.tenant.schoolId, req.params.examId));
});

export const markReviewReadiness = catchAsync(async (req, res) => {
  sendSuccess(res, await markReview.getExamReadiness(req.tenant.schoolId, req.params.examId));
});

export const submitMarksGroup = catchAsync(async (req, res) => {
  await staffGuard(req, req.params.examId, req.params.scheduleId);
  sendSuccess(
    res,
    await markReview.submitMarksForSchedule(
      req.tenant.schoolId,
      req.params.examId,
      req.params.scheduleId,
      req.tenant.userId
    )
  );
});

export const verifyMarksGroup = catchAsync(async (req, res) => {
  sendSuccess(
    res,
    await markReview.verifyScheduleMarks(
      req.tenant.schoolId,
      req.params.examId,
      req.params.scheduleId,
      req.tenant.userId
    )
  );
});

export const rejectMarksGroup = catchAsync(async (req, res) => {
  sendSuccess(
    res,
    await markReview.rejectScheduleMarks(
      req.tenant.schoolId,
      req.params.examId,
      req.params.scheduleId,
      req.body.reason,
      req.tenant.userId
    )
  );
});

export const lockExamMarks = catchAsync(async (req, res) => {
  sendSuccess(res, await markReview.lockExamMarks(req.tenant.schoolId, req.params.examId, req.tenant.userId));
});

export const getComputationRun = catchAsync(async (req, res) => {
  sendSuccess(res, await computation.getRunStatus(req.tenant.schoolId, req.params.runId));
});

export const processComputationQueue = catchAsync(async (req, res) => {
  sendSuccess(res, await computation.processPendingRuns(10));
});

export const bulkMarksPreview = catchAsync(async (req, res) => {
  await staffGuard(req, req.params.examId, req.params.scheduleId);
  const { csv } = req.body;
  sendSuccess(
    res,
    await markBulk.dryRunBulkMarks(
      req.tenant.schoolId,
      req.params.examId,
      req.params.scheduleId,
      csv
    )
  );
});

export const bulkMarksCommit = catchAsync(async (req, res) => {
  await staffGuard(req, req.params.examId, req.params.scheduleId);
  sendSuccess(
    res,
    await markBulk.commitBulkMarks(
      req.tenant.schoolId,
      req.params.examId,
      req.params.scheduleId,
      req.body.csv,
      req.tenant.userId
    ),
    201
  );
});

export const listComputedResults = catchAsync(async (req, res) => {
  const { rows, total, page, limit } = await resultsService.listComputedResults(
    req.tenant.schoolId,
    { ...req.query, exam_id: req.params.examId }
  );
  sendPaginated(res, rows, total, page, limit);
});

export const computeTermResults = catchAsync(async (req, res) => {
  const run = await computation.enqueueTermComputation(
    req.tenant.schoolId,
    req.params.termId,
    req.tenant.userId
  );
  const processed = await computation.processPendingRuns(1);
  sendSuccess(res, { run_id: run.id, queue: processed });
});

export const downloadReportCard = catchAsync(async (req, res) => {
  const studentId = req.params.studentId;
  const buf = await buildStudentReportCardPdf(req.tenant.schoolId, studentId, {
    term_id: req.query.term_id || undefined,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=report-card-${studentId}.pdf`);
  res.send(buf);
});


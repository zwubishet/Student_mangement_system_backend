import catchAsync from '../utils/catchAsync.js';
import { sendSuccess } from '../utils/errors.js';
import * as svc from '../services/teacherPortalService.js';

const ctx = (req) => [req.tenant.schoolId, req.tenant.userId];

export const dashboard = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherDashboard(...ctx(req)));
});

export const classes = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherClasses(...ctx(req)));
});

export const classDetail = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherClassDetail(...ctx(req), req.params.sectionId));
});

export const students = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherStudents(...ctx(req), req.query));
});

export const studentDetail = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherStudentDetail(...ctx(req), req.params.studentId));
});

export const getAttendance = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getSectionAttendance(...ctx(req), req.params.sectionId, req.query.date));
});

export const markAttendance = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.markSectionAttendance(...ctx(req), req.params.sectionId, req.body));
});

export const listExams = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherExamMarkTasks(...ctx(req), req.query));
});

export const getMarkSheet = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherMarkSheet(...ctx(req), req.params.examId, req.params.scheduleId));
});

export const saveMarks = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.saveTeacherMarks(...ctx(req), req.params.examId, req.params.scheduleId, req.body));
});

export const submitMarks = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.submitTeacherMarksForReview(...ctx(req), req.params.examId, req.params.scheduleId));
});

export const notifications = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherNotifications(...ctx(req)));
});

export const me = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherMe(...ctx(req)));
});

export const timetable = catchAsync(async (req, res) => {
  sendSuccess(res, await svc.getTeacherTimetable(...ctx(req)));
});

export const exportRoster = catchAsync(async (req, res) => {
  const { content, filename } = await svc.exportSectionRosterCsv(
    ...ctx(req),
    req.params.sectionId
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
});

export const classReport = catchAsync(async (req, res) => {
  sendSuccess(
    res,
    await svc.getTeacherClassReportPreview(...ctx(req), req.params.sectionId, req.query)
  );
});

export const guardianDirectory = catchAsync(async (req, res) => {
  sendSuccess(
    res,
    await svc.getSectionGuardianDirectory(...ctx(req), req.params.sectionId)
  );
});

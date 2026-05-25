import catchAsync from '../utils/catchAsync.js';
import { sendSuccess } from '../utils/errors.js';
import * as studentPortal from '../services/studentPortalService.js';

export const dashboard = catchAsync(async (req, res) => {
  sendSuccess(res, await studentPortal.getStudentDashboard(req.tenant.schoolId, req.tenant.userId));
});

export const profile = catchAsync(async (req, res) => {
  sendSuccess(res, await studentPortal.getStudentProfile(req.tenant.schoolId, req.tenant.userId));
});

export const changePassword = catchAsync(async (req, res) => {
  sendSuccess(res, await studentPortal.changeStudentPassword(
    req.tenant.schoolId,
    req.tenant.userId,
    req.body
  ));
});

export const timetable = catchAsync(async (req, res) => {
  sendSuccess(res, await studentPortal.getStudentTimetable(req.tenant.schoolId, req.tenant.userId));
});

export const attendance = catchAsync(async (req, res) => {
  sendSuccess(res, await studentPortal.getStudentAttendance(req.tenant.schoolId, req.tenant.userId, {
    days: req.query.days ? Number(req.query.days) : 60,
  }));
});

export const exams = catchAsync(async (req, res) => {
  sendSuccess(res, await studentPortal.getStudentExams(req.tenant.schoolId, req.tenant.userId, {
    term_id: req.query.term_id || undefined,
  }));
});

export const fees = catchAsync(async (req, res) => {
  sendSuccess(res, await studentPortal.getStudentFees(req.tenant.schoolId, req.tenant.userId));
});

export const announcements = catchAsync(async (req, res) => {
  sendSuccess(res, await studentPortal.getStudentAnnouncements(req.tenant.schoolId, req.tenant.userId));
});

export const reportCard = catchAsync(async (req, res) => {
  const buf = await studentPortal.getStudentReportCardPdf(req.tenant.schoolId, req.tenant.userId, {
    term_id: req.query.term_id || undefined,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=my-report-card.pdf');
  res.send(buf);
});

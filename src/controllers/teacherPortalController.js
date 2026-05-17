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

import Joi from 'joi';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import AppError from '../../utils/appError.js';
import * as payrollService from '../../services/finance/payrollService.js';
import * as financeUserService from '../../services/finance/financeUserService.js';
import * as approvalService from '../../services/finance/approvalService.js';
import * as staffHrReviewService from '../../services/finance/staffHrReviewService.js';

const validate = (schema, body) => {
  const { value, error } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError(error.details.map((d) => d.message).join(', '), 400);
  return value;
};

export const getPayrollOverview = catchAsync(async (req, res) => {
  const data = await payrollService.getPayrollOverview(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const getPayrollStaffRoster = catchAsync(async (req, res) => {
  const data = await payrollService.listPayrollStaffRoster(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const getPayrollRuns = catchAsync(async (req, res) => {
  const data = await payrollService.listPayrollRuns(req.tenant.schoolId, {
    status: req.query.status,
  });
  sendSuccess(res, data);
});

export const getPayrollRunDetail = catchAsync(async (req, res) => {
  const data = await payrollService.getPayrollRun(req.tenant.schoolId, req.params.id);
  sendSuccess(res, data);
});

export const getPayrollCandidates = catchAsync(async (req, res) => {
  const data = await payrollService.listPayrollCandidates(req.tenant.schoolId);
  sendSuccess(res, data);
});

const payrollEntrySchema = Joi.object({
  staff_id: Joi.string().uuid().required(),
  teacher_id: Joi.string().uuid().allow(null),
  employee_name: Joi.string().allow('', null),
  base_salary: Joi.number().min(0),
  housing_allowance: Joi.number().min(0),
  transport_allowance: Joi.number().min(0),
  other_allowances: Joi.number().min(0),
  tax_withheld: Joi.number().min(0),
  pension_employee: Joi.number().min(0),
  other_deductions: Joi.number().min(0),
  allowances: Joi.number().min(0),
  deductions: Joi.number().min(0),
  payment_method: Joi.string().max(30),
  notes: Joi.string().max(200).allow('', null),
});

export const postPayrollRun = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    academic_year: Joi.string().max(9).allow('', null),
    period_label: Joi.string().trim().min(2).max(80).required(),
    period_start: Joi.date().iso().required(),
    period_end: Joi.date().iso().required(),
    pay_date: Joi.date().iso().allow(null),
    notes: Joi.string().max(500).allow('', null),
    include_zero: Joi.boolean(),
    apply_pension: Joi.boolean(),
    entries: Joi.array().items(payrollEntrySchema),
  }), req.body);
  const data = await payrollService.createPayrollRun(
    req.tenant.schoolId,
    req.tenant.userId,
    input
  );
  sendSuccess(res, data, 201);
});

const payrollEntryPatchSchema = Joi.object({
  base_salary: Joi.number().min(0),
  housing_allowance: Joi.number().min(0),
  transport_allowance: Joi.number().min(0),
  other_allowances: Joi.number().min(0),
  tax_withheld: Joi.number().min(0),
  pension_employee: Joi.number().min(0),
  other_deductions: Joi.number().min(0),
  payment_method: Joi.string().max(30),
  notes: Joi.string().max(200).allow('', null),
});

export const patchPayrollEntry = catchAsync(async (req, res) => {
  const input = validate(payrollEntryPatchSchema, req.body);
  const data = await payrollService.updatePayrollEntry(
    req.tenant.schoolId,
    req.params.runId,
    req.params.entryId,
    input
  );
  sendSuccess(res, data);
});

export const submitPayrollRun = catchAsync(async (req, res) => {
  const data = await payrollService.submitPayrollForApproval(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId
  );
  sendSuccess(res, data);
});

export const approvePayrollRun = catchAsync(async (req, res) => {
  const data = await payrollService.approvePayrollRun(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId
  );
  sendSuccess(res, data);
});

export const rejectPayrollRun = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    reason: Joi.string().max(500).allow('', null),
  }), req.body);
  const data = await payrollService.rejectPayrollRun(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId,
    input.reason
  );
  sendSuccess(res, data);
});

export const payPayrollRun = catchAsync(async (req, res) => {
  const data = await payrollService.markPayrollRunPaid(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId
  );
  sendSuccess(res, data);
});

export const getPendingApprovals = catchAsync(async (req, res) => {
  const data = await approvalService.listPendingApprovals(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const listFeeRequests = catchAsync(async (req, res) => {
  const data = await approvalService.listFeeGenerationRequests(req.tenant.schoolId, {
    status: req.query.status,
  });
  sendSuccess(res, data);
});

export const createFeeRequest = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    academic_year: Joi.string().trim().max(9).required(),
    term: Joi.number().integer().min(1).max(3).allow(null),
    grade_id: Joi.string().uuid().allow(null),
    due_date: Joi.date().iso(),
    discount_rule_id: Joi.string().uuid().allow(null),
    payment_plan_id: Joi.string().uuid().allow(null),
    notes: Joi.string().max(500).allow('', null),
  }), req.body);
  const data = await approvalService.createFeeGenerationRequest(
    req.tenant.schoolId,
    req.tenant.userId,
    input
  );
  sendSuccess(res, data, 201);
});

export const approveFeeRequest = catchAsync(async (req, res) => {
  const data = await approvalService.approveFeeGenerationRequest(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId
  );
  sendSuccess(res, data);
});

export const rejectFeeRequest = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    reason: Joi.string().max(500).allow('', null),
  }), req.body);
  const data = await approvalService.rejectFeeGenerationRequest(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId,
    input.reason
  );
  sendSuccess(res, data);
});

export const listFinanceTeam = catchAsync(async (req, res) => {
  const data = await financeUserService.listFinanceOfficers(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const createHrReviewRequest = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    message: Joi.string().max(1000).allow('', null),
  }), req.body);
  const data = await staffHrReviewService.createHrReviewRequest(
    req.tenant.schoolId,
    req.params.teacherId,
    req.tenant.userId,
    input
  );
  sendSuccess(res, data, 201);
});

export const listHrReviewRequests = catchAsync(async (req, res) => {
  const data = await staffHrReviewService.listHrReviewRequests(req.tenant.schoolId, {
    status: req.query.status,
  });
  sendSuccess(res, data);
});

export const resolveHrReviewRequest = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    status: Joi.string().valid('reviewed', 'dismissed').required(),
    admin_note: Joi.string().max(500).allow('', null),
  }), req.body);
  const data = await staffHrReviewService.resolveHrReviewRequest(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId,
    input
  );
  sendSuccess(res, data);
});

export const createFinanceTeamMember = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    first_name: Joi.string().trim().min(1).max(80).required(),
    last_name: Joi.string().trim().min(1).max(80).required(),
  }), req.body);
  const data = await financeUserService.createFinanceOfficer(
    req.tenant.schoolId,
    input,
    req.tenant.userId
  );
  sendSuccess(res, data, 201);
});

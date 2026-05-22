import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import AppError from '../../utils/appError.js';
import * as platformService from '../../services/platform/superAdminService.js';

const parseStatusBody = (body) => {
  if (body?.input?.object) {
    return body.input.object;
  }
  return body;
};

export const getOverview = catchAsync(async (req, res) => {
  const data = await platformService.getPlatformOverview();
  sendSuccess(res, data);
});

export const getHealth = catchAsync(async (req, res) => {
  const data = await platformService.getPlatformHealth();
  sendSuccess(res, data);
});

export const listSchools = catchAsync(async (req, res) => {
  const { search, status, limit, offset } = req.query;
  const data = await platformService.listSchools({
    search,
    status,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0,
  });
  sendSuccess(res, data.rows, 200, { total: data.total });
});

/** Backward-compatible shape for legacy clients. */
export const listSchoolsLegacy = catchAsync(async (req, res) => {
  const data = await platformService.listSchools({ limit: 500, offset: 0 });
  res.json({ schools: data.rows });
});

export const getSchool = catchAsync(async (req, res) => {
  const data = await platformService.getSchoolByIdPlatform(req.params.id);
  sendSuccess(res, data);
});

export const createSchool = catchAsync(async (req, res) => {
  const data = await platformService.createSchoolWithAdminPlatform(req.platform.userId, req.body);
  sendSuccess(res, data, 201);
});

export const updateSchool = catchAsync(async (req, res) => {
  const data = await platformService.updateSchoolPlatform(req.platform.userId, req.params.id, req.body);
  sendSuccess(res, data);
});

export const updateSchoolStatus = catchAsync(async (req, res, next) => {
  const session = req.body.session_variables;
  if (session && session['x-hasura-role'] !== 'SUPER_ADMIN') {
    return next(new AppError('Platform administrator access required.', 403));
  }

  const parsed = parseStatusBody(req.body);
  const { school_id, status, suspended_reason: reason } = parsed;
  if (!school_id || !status) {
    return next(new AppError('school_id and status are required.', 400));
  }

  const actorId = req.platform?.userId || session?.['x-hasura-user-id'];
  const data = await platformService.updateSchoolStatusPlatform(actorId, school_id, status, reason);

  if (session) {
    return res.json(data);
  }
  sendSuccess(res, data);
});

/** Hasura action + legacy alias */
export const toggleSchoolStatus = updateSchoolStatus;

export const listSubscriptions = catchAsync(async (req, res) => {
  const data = await platformService.listSubscriptions({
    status: req.query.status,
    limit: req.query.limit ? Number(req.query.limit) : 100,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data);
});

export const listPlatformAudit = catchAsync(async (req, res) => {
  const data = await platformService.listPlatformAuditLogs({
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data);
});

export const listTenantAudit = catchAsync(async (req, res) => {
  const data = await platformService.listTenantAuditLogs({
    schoolId: req.query.school_id,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data);
});

export const getSettings = catchAsync(async (req, res) => {
  const data = await platformService.getPlatformSettings();
  sendSuccess(res, data);
});

export const patchSettings = catchAsync(async (req, res) => {
  const data = await platformService.updatePlatformSettings(req.platform.userId, req.body);
  sendSuccess(res, data);
});

export const getFeatureFlags = catchAsync(async (req, res) => {
  const data = await platformService.getSchoolFeatureFlags(req.params.id);
  sendSuccess(res, data);
});

export const putFeatureFlags = catchAsync(async (req, res) => {
  const data = await platformService.setSchoolFeatureFlags(
    req.platform.userId,
    req.params.id,
    req.body.features
  );
  sendSuccess(res, data);
});

export const listUsers = catchAsync(async (req, res) => {
  const data = await platformService.listPlatformUsers({
    schoolId: req.query.school_id,
    search: req.query.search,
    role: req.query.role,
    status: req.query.status,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data.rows, 200, { total: data.total });
});

export const listStudents = catchAsync(async (req, res) => {
  const data = await platformService.listPlatformStudents({
    schoolId: req.query.school_id,
    search: req.query.search,
    status: req.query.status,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data.rows, 200, { total: data.total });
});

export const listTeachers = catchAsync(async (req, res) => {
  const data = await platformService.listPlatformTeachers({
    schoolId: req.query.school_id,
    search: req.query.search,
    status: req.query.status,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data.rows, 200, { total: data.total });
});

export const getActivity = catchAsync(async (req, res) => {
  const data = await platformService.getPlatformActivityFeed({
    schoolId: req.query.school_id,
    limit: req.query.limit ? Number(req.query.limit) : 60,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data);
});

export const getSchoolSummary = catchAsync(async (req, res) => {
  const data = await platformService.getSchoolTenantSummary(req.params.id);
  sendSuccess(res, data);
});

export const getPlatformFinance = catchAsync(async (req, res) => {
  const { getPlatformFinanceOverview } = await import('../../services/finance/financeService.js');
  const data = await getPlatformFinanceOverview();
  sendSuccess(res, data);
});

export const getPlatformFinanceTransactions = catchAsync(async (req, res) => {
  const { listPlatformTransactions } = await import('../../services/finance/financeService.js');
  const data = await listPlatformTransactions({
    schoolId: req.query.school_id,
    type: req.query.type,
    limit: req.query.limit ? Number(req.query.limit) : 150,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data);
});

export const getPlatformFinanceCommissions = catchAsync(async (req, res) => {
  const { listPlatformCommissions } = await import('../../services/finance/financeService.js');
  const data = await listPlatformCommissions({
    schoolId: req.query.school_id,
    limit: req.query.limit ? Number(req.query.limit) : 150,
  });
  sendSuccess(res, data);
});

export const getPlatformFinanceBilling = catchAsync(async (req, res) => {
  const { listPlatformBillingInvoices } = await import('../../services/finance/financeService.js');
  const data = await listPlatformBillingInvoices({ status: req.query.status });
  sendSuccess(res, data);
});

export const createPlatformFinanceOfficer = catchAsync(async (req, res, next) => {
  const { createFinanceOfficer } = await import('../../services/finance/financeUserService.js');
  const schoolId = req.params.schoolId || req.body.school_id;
  if (!schoolId) {
    return next(new AppError('school_id required', 400));
  }
  const data = await createFinanceOfficer(schoolId, req.body, req.platform.userId);
  sendSuccess(res, data, 201);
});

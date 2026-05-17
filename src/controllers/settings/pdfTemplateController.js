import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import * as pdfTemplate from '../../services/pdfTemplateService.js';

export const list = catchAsync(async (req, res) => {
  sendSuccess(res, await pdfTemplate.listPdfTemplates(req.tenant.schoolId));
});

export const upsert = catchAsync(async (req, res) => {
  sendSuccess(res, await pdfTemplate.upsertPdfTemplate(req.tenant.schoolId, req.params.key, req.body, req.tenant.userId));
});

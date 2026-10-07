import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/errors.js';
import * as resources from '../../services/library/resourceService.js';
import * as shares from '../../services/library/resourceShareService.js';

export const overview = catchAsync(async (req, res) => {
  sendSuccess(res, await resources.getOverview(req.tenant.schoolId));
});

export const categories = catchAsync(async (req, res) => {
  sendSuccess(res, await resources.listCategories());
});

export const list = catchAsync(async (req, res) => {
  const result = await resources.listResources(req.tenant.schoolId, {
    ...req.query,
    userId: req.tenant.userId,
  }, req.tenant.role);
  sendPaginated(res, result.items, result.total, result.page, result.limit);
});

export const getOne = catchAsync(async (req, res) => {
  sendSuccess(res, await resources.getResource(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.role,
    req.tenant.userId
  ));
});

export const create = catchAsync(async (req, res) => {
  sendSuccess(
    res,
    await resources.createResource(req.tenant.schoolId, req.body, req.tenant.userId, req.tenant.role),
    201
  );
});

export const review = catchAsync(async (req, res) => {
  sendSuccess(res, await resources.reviewResource(
    req.tenant.schoolId,
    req.params.id,
    req.body,
    req.tenant.userId
  ));
});

export const remove = catchAsync(async (req, res) => {
  sendSuccess(res, await resources.softDeleteResource(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId,
    req.tenant.role
  ));
});

export const access = catchAsync(async (req, res) => {
  sendSuccess(res, await resources.getResourceAccess(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId,
    req.tenant.role,
    { action: req.query.action || 'view', ip: req.ip }
  ));
});

export const bookmark = catchAsync(async (req, res) => {
  sendSuccess(res, await resources.toggleBookmark(
    req.tenant.schoolId,
    req.params.id,
    req.tenant.userId
  ));
});

export const shareMySections = catchAsync(async (req, res) => {
  sendSuccess(res, await shares.getTeacherShareableSections({
    teacherId: req.tenant.userId,
    schoolId: req.tenant.schoolId,
  }));
});

export const sectionLibrary = catchAsync(async (req, res) => {
  const { sectionId } = req.params;

  if (req.tenant.role === 'STUDENT') {
    const allowed = await shares.verifyStudentSectionAccess(req.tenant.userId, sectionId);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'You are not enrolled in this section.' });
    }
  }

  sendSuccess(res, await shares.getSectionLibrary({
    sectionId,
    schoolId: req.tenant.schoolId,
    filters: req.query,
  }));
});

export const share = catchAsync(async (req, res) => {
  const { section_ids, note, is_pinned } = req.body;
  if (!Array.isArray(section_ids) || !section_ids.length) {
    return res.status(400).json({ success: false, message: 'section_ids must be a non-empty array.' });
  }

  const created = await shares.shareResourceToSections({
    resourceId: req.params.id,
    sectionIds: section_ids,
    teacherId: req.tenant.userId,
    schoolId: req.tenant.schoolId,
    note,
    isPinned: is_pinned || false,
    role: req.tenant.role,
  });

  sendSuccess(res, { shares: created }, 201);
});

export const listShares = catchAsync(async (req, res) => {
  sendSuccess(res, await shares.listResourceShares(req.tenant.schoolId, req.params.id));
});

export const unshare = catchAsync(async (req, res) => {
  sendSuccess(res, await shares.unshareResource({
    shareId: req.params.shareId,
    requesterId: req.tenant.userId,
    role: req.tenant.role,
    schoolId: req.tenant.schoolId,
  }));
});

export const pinShare = catchAsync(async (req, res) => {
  sendSuccess(res, await shares.togglePin({
    shareId: req.params.shareId,
    requesterId: req.tenant.userId,
    role: req.tenant.role,
    schoolId: req.tenant.schoolId,
  }));
});

import catchAsync from '../../utils/catchAsync.js';
import * as svc from '../../services/platform/providerPointService.js';
import { canPlatformWrite } from '../../constants/roles.js';
import AppError from '../../utils/appError.js';

export const getMe = catchAsync(async (req, res) => {
  const profile = await svc.getPlatformProfile(req.platform.userId);
  res.json({ success: true, data: profile });
});

export const patchMe = catchAsync(async (req, res) => {
  const profile = await svc.updatePlatformProfile(req.platform.userId, req.body);
  res.json({ success: true, data: profile });
});

export const getPointBalance = catchAsync(async (req, res) => {
  const balance = await svc.getProviderBalance(req.platform.userId);
  res.json({ success: true, data: balance });
});

export const listPointClaims = catchAsync(async (req, res) => {
  const { status, limit, offset } = req.query;
  const result = await svc.listPointClaims({
    userId: req.platform.userId,
    roles: req.platform.roles,
    status,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0,
  });
  res.json({ success: true, data: result.items, meta: { total: result.total } });
});

export const createPointClaim = catchAsync(async (req, res) => {
  const claim = await svc.createPointClaim({
    userId: req.platform.userId,
    points: req.body.points,
    providerNote: req.body.provider_note,
  });
  res.status(201).json({ success: true, data: claim });
});

export const reviewPointClaim = catchAsync(async (req, res) => {
  if (!canPlatformWrite(req.platform.roles)) {
    throw new AppError('Only provider admins can review claims.', 403);
  }
  const claim = await svc.reviewPointClaim({
    claimId: req.params.id,
    reviewerId: req.platform.userId,
    status: req.body.status,
    reviewNote: req.body.review_note,
  });
  res.json({ success: true, data: claim });
});

export const cancelPointClaim = catchAsync(async (req, res) => {
  const claim = await svc.cancelPointClaim({
    claimId: req.params.id,
    userId: req.platform.userId,
  });
  res.json({ success: true, data: claim });
});

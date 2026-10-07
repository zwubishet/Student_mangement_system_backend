import { AppError, ERROR_CODES } from '../../utils/errors.js';

/** @type {Record<string, string[]>} */
export const VALID_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['verified', 'rejected'],
  verified: ['locked', 'submitted'],
  locked: [],
  rejected: ['draft', 'submitted'],
};

/**
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @param {object} [ctx]
 * @returns {string}
 */
export function transition(currentStatus, targetStatus, ctx = {}) {
  const current = currentStatus || 'draft';
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed?.includes(targetStatus)) {
    throw new AppError(
      `Cannot change mark status from "${current}" to "${targetStatus}".`,
      400,
      ERROR_CODES.INVALID_OPERATION
    );
  }

  if (targetStatus === 'submitted' && ctx.role === 'TEACHER' && current === 'verified') {
    throw new AppError('Verified marks cannot be re-submitted by teachers.', 403, ERROR_CODES.FORBIDDEN);
  }

  if (targetStatus === 'locked' && current !== 'verified') {
    throw new AppError('Only verified marks can be locked.', 400, ERROR_CODES.INVALID_OPERATION);
  }

  return targetStatus;
}

/**
 * @param {string} status
 * @returns {boolean}
 */
export function isEditable(status) {
  return ['draft', 'rejected'].includes(status);
}

/**
 * @param {string} status
 * @returns {boolean}
 */
export function isLocked(status) {
  return status === 'locked';
}

import { query } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import * as payrollService from './payrollService.js';

export const createHrReviewRequest = async (schoolId, teacherId, userId, { message } = {}) => {
  const teacher = await query(
    `SELECT t.id, u.first_name, u.last_name, u.email
     FROM academic.teachers t
     JOIN identity.users u ON u.id = t.user_id
     WHERE t.school_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [schoolId, teacherId]
  );
  if (!teacher.rows[0]) throw new AppError('Teacher not found', 404);

  let rosterRow = null;
  try {
    const roster = await payrollService.listPayrollStaffRoster(schoolId);
    rosterRow = roster.find((r) => r.teacher_id === teacherId) || null;
  } catch {
    rosterRow = null;
  }

  const pending = await query(
    `SELECT id FROM finance.staff_hr_review_requests
     WHERE school_id = $1 AND teacher_id = $2 AND status = 'pending' LIMIT 1`,
    [schoolId, teacherId]
  );
  if (pending.rows[0]) {
    throw new AppError('A pending HR review request already exists for this teacher.', 409);
  }

  const res = await query(
    `INSERT INTO finance.staff_hr_review_requests (
       school_id, teacher_id, requested_by, message, snapshot
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      schoolId,
      teacherId,
      userId,
      message || null,
      JSON.stringify({
        teacher: teacher.rows[0],
        payroll: rosterRow,
        requested_at: new Date().toISOString(),
      }),
    ]
  );
  return res.rows[0];
};

export const listHrReviewRequests = async (schoolId, { status } = {}) => {
  const params = [schoolId];
  let sql = `
    SELECT r.*, u.first_name AS requester_first, u.last_name AS requester_last,
           t_u.first_name AS teacher_first, t_u.last_name AS teacher_last
    FROM finance.staff_hr_review_requests r
    JOIN identity.users u ON u.id = r.requested_by
    JOIN academic.teachers t ON t.id = r.teacher_id
    JOIN identity.users t_u ON t_u.id = t.user_id
    WHERE r.school_id = $1`;
  if (status) {
    params.push(status);
    sql += ` AND r.status = $${params.length}`;
  }
  sql += ' ORDER BY r.created_at DESC LIMIT 100';
  const res = await query(sql, params);
  return res.rows;
};

export const resolveHrReviewRequest = async (schoolId, requestId, userId, { status, admin_note }) => {
  if (!['reviewed', 'dismissed'].includes(status)) {
    throw new AppError('Invalid status', 400);
  }
  const res = await query(
    `UPDATE finance.staff_hr_review_requests
     SET status = $1, admin_note = $2, reviewed_at = now(), reviewed_by = $3
     WHERE id = $4 AND school_id = $5 AND status = 'pending'
     RETURNING *`,
    [status, admin_note || null, userId, requestId, schoolId]
  );
  if (!res.rows[0]) throw new AppError('Request not found or already handled', 404);
  return res.rows[0];
};

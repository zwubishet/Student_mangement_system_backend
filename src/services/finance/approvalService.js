import { query } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { generateTermInvoices } from './financeService.js';

export const listPendingApprovals = async (schoolId) => {
  const [payroll, fees] = await Promise.all([
    query(
      `SELECT pr.*, u.first_name AS created_by_first, u.last_name AS created_by_last
       FROM finance.payroll_runs pr
       LEFT JOIN identity.users u ON u.id = pr.created_by
       WHERE pr.school_id = $1 AND pr.status = 'pending_approval'
       ORDER BY pr.submitted_at DESC NULLS LAST, pr.created_at DESC`,
      [schoolId]
    ),
    query(
      `SELECT fgr.*, g.name AS grade_name, dr.name AS discount_name,
              u.first_name AS created_by_first, u.last_name AS created_by_last
       FROM finance.fee_generation_requests fgr
       LEFT JOIN academic.grades g ON g.id = fgr.grade_id
       LEFT JOIN finance.discount_rules dr ON dr.id = fgr.discount_rule_id
       LEFT JOIN identity.users u ON u.id = fgr.created_by
       WHERE fgr.school_id = $1 AND fgr.status = 'pending_approval'
       ORDER BY fgr.submitted_at DESC`,
      [schoolId]
    ),
  ]);
  return { payroll: payroll.rows, fee_requests: fees.rows };
};

export const listFeeGenerationRequests = async (schoolId, { status, limit = 50 } = {}) => {
  const params = [schoolId];
  let sql = `
    SELECT fgr.*, g.name AS grade_name
    FROM finance.fee_generation_requests fgr
    LEFT JOIN academic.grades g ON g.id = fgr.grade_id
    WHERE fgr.school_id = $1`;
  if (status) {
    params.push(status);
    sql += ` AND fgr.status = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY fgr.submitted_at DESC LIMIT $${params.length}`;
  return (await query(sql, params)).rows;
};

export const createFeeGenerationRequest = async (schoolId, userId, input) => {
  const res = await query(
    `INSERT INTO finance.fee_generation_requests (
       school_id, academic_year, term, grade_id, due_date,
       discount_rule_id, payment_plan_id, status, created_by, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_approval',$8,$9)
     RETURNING *`,
    [
      schoolId,
      input.academic_year,
      input.term ?? null,
      input.grade_id || null,
      input.due_date || null,
      input.discount_rule_id || null,
      input.payment_plan_id || null,
      userId,
      input.notes || null,
    ]
  );
  return res.rows[0];
};

export const approveFeeGenerationRequest = async (schoolId, requestId, userId) => {
  const req = await query(
    `SELECT * FROM finance.fee_generation_requests
     WHERE id = $1 AND school_id = $2 AND status = 'pending_approval'`,
    [requestId, schoolId]
  );
  if (!req.rows[0]) throw new AppError('Fee request not found or not pending approval', 400);

  const result = await generateTermInvoices(schoolId, userId, {
    academic_year: req.rows[0].academic_year,
    term: req.rows[0].term,
    grade_id: req.rows[0].grade_id,
    due_date: req.rows[0].due_date,
    discount_rule_id: req.rows[0].discount_rule_id,
    payment_plan_id: req.rows[0].payment_plan_id,
  });

  await query(
    `UPDATE finance.fee_generation_requests
     SET status = 'approved', approved_by = $1, approved_at = now(),
         generated_count = $2, students_count = $3
     WHERE id = $4`,
    [userId, result.generated, result.students, requestId]
  );

  const updated = await query(
    `SELECT * FROM finance.fee_generation_requests WHERE id = $1`,
    [requestId]
  );
  return { request: updated.rows[0], generation: result };
};

export const rejectFeeGenerationRequest = async (schoolId, requestId, userId, reason) => {
  const res = await query(
    `UPDATE finance.fee_generation_requests
     SET status = 'rejected', rejected_by = $1, rejection_reason = $2
     WHERE id = $3 AND school_id = $4 AND status = 'pending_approval'
     RETURNING *`,
    [userId, reason || null, requestId, schoolId]
  );
  if (!res.rows[0]) throw new AppError('Fee request not found or not pending', 400);
  return res.rows[0];
};

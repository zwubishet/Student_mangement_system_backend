import { getClient, query } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { calcLineAmounts, buildPayslipRef, suggestDeductions } from './payrollCalculations.js';

const STAFF_ROSTER_SQL = `
  SELECT
    t.id AS teacher_id,
    t.first_name,
    t.last_name,
    t.email,
    t.department AS teacher_department,
    t.status AS teacher_status,
    sp.id AS staff_id,
    sp.staff_id_number,
    sp.employment_type,
    sp.department AS staff_department,
    sp.bank_name,
    sp.bank_account_number,
    sp.bank_branch,
    sp.payment_method,
    sp.tax_identification_number,
    sp.pension_number,
    sp.hire_date,
    c.id AS contract_id,
    c.contract_type,
    c.salary_amount AS contract_salary,
    c.currency AS contract_currency,
    c.start_date AS contract_start,
    c.end_date AS contract_end,
    ay.name AS contract_academic_year,
    (
      SELECT COALESCE(SUM(pe.net_pay), 0)
      FROM finance.payroll_entries pe
      JOIN finance.payroll_runs pr ON pr.id = pe.payroll_run_id
      WHERE pe.staff_id = sp.id AND pe.school_id = $1 AND pr.status = 'paid'
        AND pr.period_start >= date_trunc('year', CURRENT_DATE)
    ) AS ytd_net_paid,
    (
      SELECT COUNT(*)::int
      FROM finance.payroll_entries pe
      JOIN finance.payroll_runs pr ON pr.id = pe.payroll_run_id
      WHERE pe.staff_id = sp.id AND pe.school_id = $1 AND pr.status = 'paid'
    ) AS lifetime_pay_slips
  FROM academic.teachers t
  JOIN identity.staff_profiles sp ON sp.id = t.staff_profile_id
  LEFT JOIN LATERAL (
    SELECT sc.*
    FROM identity.staff_contracts sc
    WHERE sc.staff_id = sp.id AND sc.school_id = $1
    ORDER BY sc.start_date DESC NULLS LAST
    LIMIT 1
  ) c ON true
  LEFT JOIN academic.academicyears ay ON ay.id = c.academic_year_id
  WHERE t.school_id = $1 AND t.deleted_at IS NULL AND sp.is_deleted = false
    AND sp.is_active = true AND t.status IN ('active', 'on_leave')
`;

const ENTRY_SELECT = `
  pe.*,
  t.email AS teacher_email,
  t.department AS teacher_department
`;

async function recalcRunTotals(client, runId) {
  const agg = await client.query(
    `SELECT
       COUNT(*)::int AS employee_count,
       COALESCE(SUM(gross_pay), 0)::numeric(12,2) AS total_gross,
       COALESCE(SUM(deductions), 0)::numeric(12,2) AS total_deductions,
       COALESCE(SUM(net_pay), 0)::numeric(12,2) AS total_net
     FROM finance.payroll_entries WHERE payroll_run_id = $1`,
    [runId]
  );
  const row = agg.rows[0];
  await client.query(
    `UPDATE finance.payroll_runs
     SET total_gross = $1, total_deductions = $2, total_net = $3,
         employee_count = $4, updated_at = now()
     WHERE id = $5`,
    [row.total_gross, row.total_deductions, row.total_net, row.employee_count, runId]
  );
}

function mapStaffToEntry(staff, runId, schoolId, opts = {}) {
  const base = Number(staff.contract_salary || 0);
  const suggested = suggestDeductions(base, { applyPension: opts.apply_pension });
  const housing = Number(opts.housing_allowance ?? Math.round(base * 0.1 * 100) / 100);
  const transport = Number(opts.transport_allowance ?? 0);
  const amounts = calcLineAmounts({
    base_salary: base,
    housing_allowance: housing,
    transport_allowance: transport,
    tax_withheld: suggested.tax_withheld,
    pension_employee: suggested.pension_employee,
    ...opts,
  });
  return {
    payroll_run_id: runId,
    school_id: schoolId,
    staff_id: staff.staff_id,
    teacher_id: staff.teacher_id,
    employee_name: `${staff.first_name} ${staff.last_name}`.trim(),
    job_title: 'Teacher',
    department: staff.staff_department || staff.teacher_department,
    staff_id_number: staff.staff_id_number,
    employment_type: staff.employment_type,
    contract_type: staff.contract_type,
    contract_salary_snapshot: base,
    pay_frequency: 'monthly',
    payment_method: staff.payment_method || 'bank_transfer',
    bank_name: staff.bank_name,
    bank_account_number: staff.bank_account_number,
    bank_branch: staff.bank_branch,
    payslip_ref: buildPayslipRef(runId, staff.staff_id_number),
    ...amounts,
  };
}

async function insertEntry(client, runId, schoolId, payload) {
  const amounts = calcLineAmounts(payload);
  await client.query(
    `INSERT INTO finance.payroll_entries (
       payroll_run_id, school_id, staff_id, teacher_id, employee_name,
       job_title, department, staff_id_number, employment_type, contract_type,
       pay_frequency, base_salary, housing_allowance, transport_allowance,
       other_allowances, allowances, tax_withheld, pension_employee,
       other_deductions, deductions, gross_pay, net_pay,
       payment_method, bank_name, bank_account_number, bank_branch,
       contract_salary_snapshot, payslip_ref, notes, status
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
       $23,$24,$25,$26,$27,$28,$29,'pending'
     )`,
    [
      runId, schoolId, payload.staff_id, payload.teacher_id || null, payload.employee_name,
      payload.job_title || null, payload.department || null, payload.staff_id_number || null,
      payload.employment_type || null, payload.contract_type || null,
      payload.pay_frequency || 'monthly',
      amounts.base_salary, amounts.housing_allowance, amounts.transport_allowance,
      amounts.other_allowances, amounts.allowances,
      amounts.tax_withheld, amounts.pension_employee, amounts.other_deductions,
      amounts.deductions, amounts.gross_pay, amounts.net_pay,
      payload.payment_method || 'bank_transfer',
      payload.bank_name || null, payload.bank_account_number || null, payload.bank_branch || null,
      payload.contract_salary_snapshot ?? amounts.base_salary,
      payload.payslip_ref || buildPayslipRef(runId, payload.staff_id_number),
      payload.notes || null,
    ]
  );
}

export const getPayrollOverview = async (schoolId) => {
  const [runs, roster, ytd] = await Promise.all([
    query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total_net), 0)::numeric(12,2) AS amount
       FROM finance.payroll_runs WHERE school_id = $1
       GROUP BY status`,
      [schoolId]
    ),
    query(
      `SELECT COUNT(*)::int AS active_staff FROM (${STAFF_ROSTER_SQL}) r`,
      [schoolId]
    ),
    query(
      `SELECT COALESCE(SUM(pe.net_pay), 0)::numeric(12,2) AS ytd_disbursed,
              COUNT(DISTINCT pe.staff_id)::int AS staff_paid_ytd
       FROM finance.payroll_entries pe
       JOIN finance.payroll_runs pr ON pr.id = pe.payroll_run_id
       WHERE pe.school_id = $1 AND pr.status = 'paid'
         AND pr.period_start >= date_trunc('year', CURRENT_DATE)`,
      [schoolId]
    ),
  ]);

  const byStatus = {};
  runs.rows.forEach((r) => { byStatus[r.status] = { count: r.count, amount: r.amount }; });

  return {
    active_staff: roster.rows[0]?.active_staff ?? 0,
    ytd_disbursed: ytd.rows[0]?.ytd_disbursed ?? 0,
    staff_paid_ytd: ytd.rows[0]?.staff_paid_ytd ?? 0,
    runs_by_status: byStatus,
    pending_approval: byStatus.pending_approval?.count ?? 0,
    draft_runs: byStatus.draft?.count ?? 0,
  };
};

export const listPayrollStaffRoster = async (schoolId) => {
  const res = await query(
    `${STAFF_ROSTER_SQL} ORDER BY last_name, first_name`,
    [schoolId]
  );
  return res.rows.map((r) => ({
    ...r,
    contract_salary: Number(r.contract_salary || 0),
    ytd_net_paid: Number(r.ytd_net_paid || 0),
    suggested_net: calcLineAmounts({
      base_salary: r.contract_salary,
      housing_allowance: Math.round(Number(r.contract_salary) * 0.1 * 100) / 100,
      ...suggestDeductions(r.contract_salary, { applyPension: false }),
    }).net_pay,
  }));
};

export const listPayrollRuns = async (schoolId, { status, limit = 50 } = {}) => {
  const params = [schoolId];
  let sql = `
    SELECT pr.*,
           u1.first_name AS created_by_first, u1.last_name AS created_by_last,
           u2.first_name AS submitted_by_first, u2.last_name AS submitted_by_last,
           u3.first_name AS approved_by_first, u3.last_name AS approved_by_last
    FROM finance.payroll_runs pr
    LEFT JOIN identity.users u1 ON u1.id = pr.created_by
    LEFT JOIN identity.users u2 ON u2.id = pr.submitted_by
    LEFT JOIN identity.users u3 ON u3.id = pr.approved_by
    WHERE pr.school_id = $1`;
  if (status) {
    params.push(status);
    sql += ` AND pr.status = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY pr.period_start DESC, pr.created_at DESC LIMIT $${params.length}`;
  return (await query(sql, params)).rows;
};

export const getPayrollRun = async (schoolId, runId) => {
  const run = await query(
    `SELECT pr.*,
            u1.first_name AS created_by_first, u1.last_name AS created_by_last,
            u2.first_name AS submitted_by_first, u2.last_name AS submitted_by_last,
            u3.first_name AS approved_by_first, u3.last_name AS approved_by_last,
            u4.first_name AS rejected_by_first, u4.last_name AS rejected_by_last
     FROM finance.payroll_runs pr
     LEFT JOIN identity.users u1 ON u1.id = pr.created_by
     LEFT JOIN identity.users u2 ON u2.id = pr.submitted_by
     LEFT JOIN identity.users u3 ON u3.id = pr.approved_by
     LEFT JOIN identity.users u4 ON u4.id = pr.rejected_by
     WHERE pr.id = $1 AND pr.school_id = $2`,
    [runId, schoolId]
  );
  if (!run.rows[0]) throw new AppError('Payroll run not found', 404);

  const entries = await query(
    `SELECT ${ENTRY_SELECT}
     FROM finance.payroll_entries pe
     LEFT JOIN academic.teachers t ON t.id = pe.teacher_id
     WHERE pe.payroll_run_id = $1 AND pe.school_id = $2
     ORDER BY pe.department NULLS LAST, pe.employee_name`,
    [runId, schoolId]
  );

  const summary = await query(
    `SELECT
       COUNT(*)::int AS total_lines,
       COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_lines,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_lines
     FROM finance.payroll_entries WHERE payroll_run_id = $1`,
    [runId]
  );

  return {
    run: run.rows[0],
    entries: entries.rows,
    summary: summary.rows[0],
  };
};

/** @deprecated use listPayrollStaffRoster */
export const listPayrollCandidates = listPayrollStaffRoster;

export const createPayrollRun = async (schoolId, userId, data) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const runRes = await client.query(
      `INSERT INTO finance.payroll_runs (
         school_id, academic_year, period_label, period_start, period_end,
         pay_date, status, notes, created_by, currency
       ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, 'ETB')
       RETURNING *`,
      [
        schoolId,
        data.academic_year || null,
        data.period_label,
        data.period_start,
        data.period_end,
        data.pay_date || data.period_end || null,
        data.notes || null,
        userId,
      ]
    );
    const run = runRes.rows[0];

    let staffList;
    if (data.entries?.length) {
      const roster = await listPayrollStaffRoster(schoolId);
      const byStaff = Object.fromEntries(roster.map((s) => [s.staff_id, s]));
      staffList = data.entries.map((e) => {
        const base = byStaff[e.staff_id];
        const amounts = calcLineAmounts(e);
        return {
          ...e,
          teacher_id: e.teacher_id || base?.teacher_id,
          employee_name: e.employee_name || (base ? `${base.first_name} ${base.last_name}` : 'Unknown'),
          job_title: e.job_title || 'Teacher',
          department: e.department || base?.staff_department,
          staff_id_number: e.staff_id_number || base?.staff_id_number,
          employment_type: e.employment_type || base?.employment_type,
          contract_type: e.contract_type || base?.contract_type,
          contract_salary_snapshot: e.contract_salary_snapshot ?? e.base_salary ?? base?.contract_salary,
          bank_name: e.bank_name || base?.bank_name,
          bank_account_number: e.bank_account_number || base?.bank_account_number,
          bank_branch: e.bank_branch || base?.bank_branch,
          payment_method: e.payment_method || base?.payment_method,
          payslip_ref: buildPayslipRef(run.id, e.staff_id_number || base?.staff_id_number),
          ...amounts,
        };
      });
    } else {
      const roster = await query(`${STAFF_ROSTER_SQL} ORDER BY last_name`, [schoolId]);
      staffList = roster.rows
        .map((s) => mapStaffToEntry(s, run.id, schoolId, { apply_pension: !!data.apply_pension }))
        .filter((e) => e.net_pay > 0 || data.include_zero);
    }

    for (const entry of staffList) {
      await insertEntry(client, run.id, schoolId, entry);
    }

    await recalcRunTotals(client, run.id);
    await client.query('COMMIT');
    return getPayrollRun(schoolId, run.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const updatePayrollEntry = async (schoolId, runId, entryId, patch) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const run = await client.query(
      `SELECT status FROM finance.payroll_runs WHERE id = $1 AND school_id = $2 FOR UPDATE`,
      [runId, schoolId]
    );
    if (!run.rows[0]) throw new AppError('Payroll run not found', 404);
    if (run.rows[0].status !== 'draft') {
      throw new AppError('Only draft payroll runs can be edited', 400);
    }

    const existing = await client.query(
      `SELECT * FROM finance.payroll_entries WHERE id = $1 AND payroll_run_id = $2 AND school_id = $3`,
      [entryId, runId, schoolId]
    );
    if (!existing.rows[0]) throw new AppError('Payroll line not found', 404);

    const merged = { ...existing.rows[0], ...patch };
    const amounts = calcLineAmounts(merged);

    await client.query(
      `UPDATE finance.payroll_entries SET
         base_salary = $1, housing_allowance = $2, transport_allowance = $3,
         other_allowances = $4, allowances = $5, tax_withheld = $6,
         pension_employee = $7, other_deductions = $8, deductions = $9,
         gross_pay = $10, net_pay = $11, notes = $12, payment_method = $13
       WHERE id = $14`,
      [
        amounts.base_salary, amounts.housing_allowance, amounts.transport_allowance,
        amounts.other_allowances, amounts.allowances, amounts.tax_withheld,
        amounts.pension_employee, amounts.other_deductions, amounts.deductions,
        amounts.gross_pay, amounts.net_pay,
        patch.notes ?? existing.rows[0].notes,
        patch.payment_method ?? existing.rows[0].payment_method,
        entryId,
      ]
    );

    await recalcRunTotals(client, runId);
    await client.query('COMMIT');
    return getPayrollRun(schoolId, runId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const submitPayrollForApproval = async (schoolId, runId, userId) => {
  const detail = await getPayrollRun(schoolId, runId);
  if (!detail.entries.length) throw new AppError('Add at least one employee before submitting', 400);
  if (Number(detail.run.total_net) <= 0) throw new AppError('Total net pay must be greater than zero', 400);

  const res = await query(
    `UPDATE finance.payroll_runs
     SET status = 'pending_approval', submitted_at = now(), submitted_by = $1, updated_at = now()
     WHERE id = $2 AND school_id = $3 AND status = 'draft'
     RETURNING *`,
    [userId, runId, schoolId]
  );
  if (!res.rows[0]) throw new AppError('Payroll run not found or not in draft', 400);
  return getPayrollRun(schoolId, runId);
};

export const approvePayrollRun = async (schoolId, runId, userId) => {
  const res = await query(
    `UPDATE finance.payroll_runs
     SET status = 'approved', approved_by = $1, updated_at = now()
     WHERE id = $2 AND school_id = $3 AND status = 'pending_approval'
     RETURNING *`,
    [userId, runId, schoolId]
  );
  if (!res.rows[0]) throw new AppError('Payroll run not found or not awaiting approval', 400);
  return getPayrollRun(schoolId, runId);
};

export const rejectPayrollRun = async (schoolId, runId, userId, reason) => {
  const res = await query(
    `UPDATE finance.payroll_runs
     SET status = 'rejected', rejected_by = $1, rejected_at = now(),
         rejection_reason = $2, updated_at = now()
     WHERE id = $3 AND school_id = $4 AND status = 'pending_approval'
     RETURNING *`,
    [userId, reason || null, runId, schoolId]
  );
  if (!res.rows[0]) throw new AppError('Payroll run not found or not awaiting approval', 400);
  return getPayrollRun(schoolId, runId);
};

export const markPayrollRunPaid = async (schoolId, runId, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const run = await client.query(
      `SELECT * FROM finance.payroll_runs WHERE id = $1 AND school_id = $2 FOR UPDATE`,
      [runId, schoolId]
    );
    if (!run.rows[0]) throw new AppError('Payroll run not found', 404);
    if (run.rows[0].status !== 'approved') {
      throw new AppError('Payroll must be approved before disbursement', 400);
    }

    const entries = await client.query(
      `SELECT * FROM finance.payroll_entries
       WHERE payroll_run_id = $1 AND school_id = $2 AND status = 'pending'`,
      [runId, schoolId]
    );

    for (const e of entries.rows) {
      await client.query(
        `INSERT INTO finance.financial_transactions (
           school_id, student_id, type, method, amount, recorded_by, notes, meta
         ) VALUES ($1, NULL, 'payroll', $2, $3, $4, $5, $6)`,
        [
          schoolId,
          e.payment_method || 'bank_transfer',
          e.net_pay,
          userId,
          `Payroll ${run.rows[0].period_label} · ${e.employee_name} (${e.staff_id_number || '—'})`,
          JSON.stringify({
            payroll_run_id: runId,
            payroll_entry_id: e.id,
            staff_id: e.staff_id,
            payslip_ref: e.payslip_ref,
            gross_pay: e.gross_pay,
          }),
        ]
      );
      await client.query(
        `UPDATE finance.payroll_entries SET status = 'paid', paid_at = now() WHERE id = $1`,
        [e.id]
      );
    }

    await client.query(
      `UPDATE finance.payroll_runs
       SET status = 'paid', paid_at = now(), pay_date = COALESCE(pay_date, CURRENT_DATE), updated_at = now()
       WHERE id = $1`,
      [runId]
    );

    await client.query('COMMIT');
    return getPayrollRun(schoolId, runId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

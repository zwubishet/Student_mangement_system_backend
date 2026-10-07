import { query, getClient } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';

const ETHIOPIA_DEFAULTS = {
  kg: { periods_per_week: 25, period_duration_minutes: 30, weeks_per_year: 30 },
  primary: { periods_per_week: 30, period_duration_minutes: 45, weeks_per_year: 30 },
  secondary: { periods_per_week: 30, period_duration_minutes: 50, weeks_per_year: 30 },
};

export const ensurePeriodConfigs = async (schoolId) => {
  for (const [level_key, cfg] of Object.entries(ETHIOPIA_DEFAULTS)) {
    await query(
      `INSERT INTO planning.school_period_config (
         school_id, level_key, periods_per_week, period_duration_minutes, weeks_per_year
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (school_id, level_key) DO NOTHING`,
      [schoolId, level_key, cfg.periods_per_week, cfg.period_duration_minutes, cfg.weeks_per_year]
    );
  }
  const result = await query(
    `SELECT * FROM planning.school_period_config WHERE school_id = $1 ORDER BY level_key`,
    [schoolId]
  );
  return result.rows;
};

const planningSchemaReady = async () => {
  const { rows } = await query(
    `SELECT to_regclass('planning.annual_plans') IS NOT NULL AS ready`
  );
  return Boolean(rows[0]?.ready);
};

const emptyOverviewStats = () => ({
  annual_plans: 0,
  annual_pending: 0,
  daily_plans: 0,
  daily_drafts: 0,
  behind_schedule: 0,
});

export const getPlanningOverview = async (schoolId, { academic_year_id, term_id } = {}) => {
  const ethiopia_calendar = {
    semesters: [
      { label: 'Semester 1', months: 'Sep – Feb', exams: 'Final exams early February' },
      { label: 'Semester 2', months: 'Feb – Jul', exams: 'Final exams early July' },
    ],
    ca_weight_percent: 40,
    final_exam_weight_percent: 60,
  };

  if (!(await planningSchemaReady())) {
    return {
      planning_ready: false,
      message: 'Lesson planning database tables are not installed. Run backend migrations (npm run migrate:psql).',
      period_configs: [],
      national_exams: [],
      stats: emptyOverviewStats(),
      ethiopia_calendar,
    };
  }

  await ensurePeriodConfigs(schoolId);

  const annualParams = [schoolId];
  let annualYearSql = '';
  if (academic_year_id) {
    annualParams.push(academic_year_id);
    annualYearSql = ` AND academic_year_id = $${annualParams.length}`;
  }

  const dailyParams = [schoolId];
  let dailyYearSql = '';
  if (academic_year_id) {
    dailyParams.push(academic_year_id);
    dailyYearSql = ` AND academic_year_id = $${dailyParams.length}`;
  }

  const [configs, nationalExams, annualStats, dailyStats] = await Promise.all([
    query(`SELECT * FROM planning.school_period_config WHERE school_id = $1`, [schoolId]),
    query(`SELECT * FROM planning.national_exam_calendar ORDER BY grade_level`),
    query(
      `SELECT
         COUNT(*)::int AS annual_plans,
         COUNT(*) FILTER (WHERE status = 'submitted')::int AS annual_pending
       FROM planning.annual_plans
       WHERE school_id = $1${annualYearSql}`,
      annualParams
    ),
    query(
      `SELECT
         COUNT(*)::int AS daily_plans,
         COUNT(*) FILTER (WHERE status = 'draft')::int AS daily_drafts,
         COUNT(*) FILTER (
           WHERE plan_date < CURRENT_DATE AND status NOT IN ('taught', 'archived')
         )::int AS behind_schedule
       FROM planning.daily_lesson_plans
       WHERE school_id = $1${dailyYearSql}`,
      dailyParams
    ),
  ]);

  return {
    planning_ready: true,
    period_configs: configs.rows,
    national_exams: nationalExams.rows,
    stats: {
      ...emptyOverviewStats(),
      ...annualStats.rows[0],
      ...dailyStats.rows[0],
    },
    ethiopia_calendar,
  };
};

export const listAnnualPlans = async (schoolId, filters = {}) => {
  const params = [schoolId];
  let sql = `
    SELECT ap.*, sub.name AS subject_name, sec.name AS section_name, g.name AS grade_name,
           ay.name AS academic_year, t.name AS term_name, t.semester_label,
           u.first_name AS teacher_first_name, u.last_name AS teacher_last_name
    FROM planning.annual_plans ap
    JOIN academic.subjects sub ON sub.id = ap.subject_id
    JOIN academic.sections sec ON sec.id = ap.section_id
    JOIN academic.grades g ON g.id = sec.grade_id
    JOIN academic.academicyears ay ON ay.id = ap.academic_year_id
    JOIN academic.terms t ON t.id = ap.term_id
    JOIN identity.users u ON u.id = ap.teacher_id
    WHERE ap.school_id = $1`;

  if (filters.academic_year_id) {
    params.push(filters.academic_year_id);
    sql += ` AND ap.academic_year_id = $${params.length}`;
  }
  if (filters.teacher_id) {
    params.push(filters.teacher_id);
    sql += ` AND ap.teacher_id = $${params.length}`;
  }
  if (filters.section_id) {
    params.push(filters.section_id);
    sql += ` AND ap.section_id = $${params.length}`;
  }
  if (filters.subject_id) {
    params.push(filters.subject_id);
    sql += ` AND ap.subject_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND ap.status = $${params.length}`;
  }
  sql += ' ORDER BY g.name, sec.name, sub.name';
  const result = await query(sql, params);
  return result.rows;
};

export const getAnnualPlan = async (schoolId, planId) => {
  const plan = await query(
    `SELECT ap.*, sub.name AS subject_name, sec.name AS section_name
     FROM planning.annual_plans ap
     JOIN academic.subjects sub ON sub.id = ap.subject_id
     JOIN academic.sections sec ON sec.id = ap.section_id
     WHERE ap.id = $1 AND ap.school_id = $2`,
    [planId, schoolId]
  );
  if (!plan.rows[0]) throw new AppError('Annual plan not found.', 404, ERROR_CODES.NOT_FOUND);

  const [months, units] = await Promise.all([
    query(
      `SELECT * FROM planning.annual_plan_months WHERE annual_plan_id = $1 ORDER BY month_number, sort_order`,
      [planId]
    ),
    query(
      `SELECT * FROM planning.unit_plans WHERE annual_plan_id = $1 ORDER BY sequence_order, unit_number`,
      [planId]
    ),
  ]);

  return { ...plan.rows[0], months: months.rows, units: units.rows };
};

export const upsertAnnualPlan = async (schoolId, data, actorId) => {
  const {
    id, academic_year_id, term_id, section_id, subject_id, teacher_id,
    title, total_periods_year, months = [], units = [],
  } = data;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let planId = id;
    if (planId) {
      await client.query(
        `UPDATE planning.annual_plans SET
           title = COALESCE($3, title),
           total_periods_year = COALESCE($4, total_periods_year),
           updated_at = now()
         WHERE id = $1 AND school_id = $2`,
        [planId, schoolId, title, total_periods_year]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO planning.annual_plans (
           school_id, academic_year_id, term_id, section_id, subject_id, teacher_id,
           title, total_periods_year, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          schoolId, academic_year_id, term_id, section_id, subject_id, teacher_id,
          title || 'Annual Plan', total_periods_year, actorId,
        ]
      );
      planId = ins.rows[0].id;
    }

    if (Array.isArray(months) && months.length > 0) {
      await client.query(`DELETE FROM planning.annual_plan_months WHERE annual_plan_id = $1`, [planId]);
      for (const m of months) {
        await client.query(
          `INSERT INTO planning.annual_plan_months (annual_plan_id, month_number, topic_title, periods_allocated, notes, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [planId, m.month_number, m.topic_title, m.periods_allocated || 0, m.notes, m.sort_order || 0]
        );
      }
    }

    if (Array.isArray(units) && units.length > 0) {
      await client.query(`DELETE FROM planning.unit_plans WHERE annual_plan_id = $1`, [planId]);
      for (const u of units) {
        await client.query(
          `INSERT INTO planning.unit_plans (annual_plan_id, unit_number, unit_title, periods_allocated, general_objectives, sequence_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [planId, u.unit_number, u.unit_title, u.periods_allocated || 1, u.general_objectives, u.sequence_order || u.unit_number]
        );
      }
    }

    await client.query('COMMIT');
    return getAnnualPlan(schoolId, planId);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw new AppError('Annual plan already exists for this assignment.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw e;
  } finally {
    client.release();
  }
};

export const submitAnnualPlan = async (schoolId, planId) => {
  const result = await query(
    `UPDATE planning.annual_plans SET status = 'submitted', submitted_at = now(), updated_at = now()
     WHERE id = $1 AND school_id = $2 AND status IN ('draft','rejected') RETURNING id`,
    [planId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Cannot submit this plan.', 400, ERROR_CODES.INVALID_OPERATION);
  return { submitted: true };
};

export const reviewAnnualPlan = async (schoolId, planId, { status, director_notes }, reviewerId) => {
  if (!['approved', 'rejected'].includes(status)) {
    throw new AppError('Status must be approved or rejected.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const result = await query(
    `UPDATE planning.annual_plans SET
       status = $3,
       director_notes = $4,
       approved_by = CASE WHEN $3 = 'approved' THEN $5 ELSE approved_by END,
       approved_at = CASE WHEN $3 = 'approved' THEN now() ELSE approved_at END,
       updated_at = now()
     WHERE id = $1 AND school_id = $2 AND status = 'submitted' RETURNING id`,
    [planId, schoolId, status, director_notes, reviewerId]
  );
  if (!result.rows[0]) throw new AppError('Plan not in submitted state.', 400, ERROR_CODES.INVALID_OPERATION);
  return { status };
};

export const listDailyPlans = async (schoolId, filters = {}) => {
  const params = [schoolId];
  let sql = `
    SELECT dlp.*, sub.name AS subject_name, sec.name AS section_name, g.name AS grade_name,
           u.first_name AS teacher_first_name, u.last_name AS teacher_last_name
    FROM planning.daily_lesson_plans dlp
    JOIN academic.subjects sub ON sub.id = dlp.subject_id
    JOIN academic.sections sec ON sec.id = dlp.section_id
    JOIN academic.grades g ON g.id = sec.grade_id
    JOIN identity.users u ON u.id = dlp.teacher_id
    WHERE dlp.school_id = $1`;

  if (filters.teacher_id) {
    params.push(filters.teacher_id);
    sql += ` AND dlp.teacher_id = $${params.length}`;
  }
  if (filters.section_id) {
    params.push(filters.section_id);
    sql += ` AND dlp.section_id = $${params.length}`;
  }
  if (filters.from_date) {
    params.push(filters.from_date);
    sql += ` AND dlp.plan_date >= $${params.length}`;
  }
  if (filters.to_date) {
    params.push(filters.to_date);
    sql += ` AND dlp.plan_date <= $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND dlp.status = $${params.length}`;
  }
  sql += ' ORDER BY dlp.plan_date DESC, dlp.period_number';
  const result = await query(sql, params);
  return result.rows;
};

export const getDailyPlan = async (schoolId, planId) => {
  const result = await query(
    `SELECT dlp.*, sub.name AS subject_name, sec.name AS section_name, g.name AS grade_name
     FROM planning.daily_lesson_plans dlp
     JOIN academic.subjects sub ON sub.id = dlp.subject_id
     JOIN academic.sections sec ON sec.id = dlp.section_id
     JOIN academic.grades g ON g.id = sec.grade_id
     WHERE dlp.id = $1 AND dlp.school_id = $2`,
    [planId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Daily lesson plan not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const upsertDailyPlan = async (schoolId, data, actorId) => {
  const fields = {
    academic_year_id: data.academic_year_id,
    term_id: data.term_id || null,
    section_id: data.section_id,
    subject_id: data.subject_id,
    teacher_id: data.teacher_id,
    timetable_slot_id: data.timetable_slot_id || null,
    plan_date: data.plan_date,
    period_number: data.period_number,
    duration_minutes: data.duration_minutes || 50,
    unit_title: data.unit_title,
    sub_unit: data.sub_unit,
    topic: data.topic,
    students_male: data.students_male ?? 0,
    students_female: data.students_female ?? 0,
    general_objective: data.general_objective,
    specific_objectives: JSON.stringify(data.specific_objectives || []),
    materials: JSON.stringify(data.materials || []),
    pre_knowledge: data.pre_knowledge,
    introduction: data.introduction,
    main_activity: data.main_activity,
    practice_activity: data.practice_activity,
    closure_summary: data.closure_summary,
    assessment_method: data.assessment_method,
    homework: data.homework,
    status: data.status || 'draft',
  };

  if (data.id) {
    const result = await query(
      `UPDATE planning.daily_lesson_plans SET
         topic = $3, unit_title = $4, sub_unit = $5, duration_minutes = $6,
         students_male = $7, students_female = $8, general_objective = $9,
         specific_objectives = $10::jsonb, materials = $11::jsonb,
         pre_knowledge = $12, introduction = $13, main_activity = $14,
         practice_activity = $15, closure_summary = $16, assessment_method = $17,
         homework = $18, status = $19, updated_at = now()
       WHERE id = $1 AND school_id = $2 RETURNING id`,
      [
        data.id, schoolId, fields.topic, fields.unit_title, fields.sub_unit, fields.duration_minutes,
        fields.students_male, fields.students_female, fields.general_objective,
        fields.specific_objectives, fields.materials, fields.pre_knowledge, fields.introduction,
        fields.main_activity, fields.practice_activity, fields.closure_summary,
        fields.assessment_method, fields.homework, fields.status,
      ]
    );
    if (!result.rows[0]) throw new AppError('Plan not found.', 404, ERROR_CODES.NOT_FOUND);
    return getDailyPlan(schoolId, data.id);
  }

  const ins = await query(
    `INSERT INTO planning.daily_lesson_plans (
       school_id, academic_year_id, term_id, section_id, subject_id, teacher_id,
       timetable_slot_id, plan_date, period_number, duration_minutes,
       unit_title, sub_unit, topic, students_male, students_female,
       general_objective, specific_objectives, materials,
       pre_knowledge, introduction, main_activity, practice_activity,
       closure_summary, assessment_method, homework, status
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,
       $19,$20,$21,$22,$23,$24,$25,$26
     ) RETURNING id`,
    [
      schoolId, fields.academic_year_id, fields.term_id, fields.section_id, fields.subject_id,
      fields.teacher_id, fields.timetable_slot_id, fields.plan_date, fields.period_number,
      fields.duration_minutes, fields.unit_title, fields.sub_unit, fields.topic,
      fields.students_male, fields.students_female, fields.general_objective,
      fields.specific_objectives, fields.materials, fields.pre_knowledge, fields.introduction,
      fields.main_activity, fields.practice_activity, fields.closure_summary,
      fields.assessment_method, fields.homework, fields.status,
    ]
  );
  return getDailyPlan(schoolId, ins.rows[0].id);
};

export const markDailyPlanTaught = async (schoolId, planId) => {
  const result = await query(
    `UPDATE planning.daily_lesson_plans SET status = 'taught', taught_at = now(), updated_at = now()
     WHERE id = $1 AND school_id = $2 RETURNING id`,
    [planId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Plan not found.', 404, ERROR_CODES.NOT_FOUND);
  return { taught: true };
};

/** Last taught + next slot for substitute teacher coverage */
export const getLessonContextForSlot = async (schoolId, { section_id, subject_id, teacher_id }) => {
  const last = await query(
    `SELECT * FROM planning.daily_lesson_plans
     WHERE school_id = $1 AND section_id = $2 AND subject_id = $3
       AND status = 'taught'
     ORDER BY plan_date DESC, period_number DESC LIMIT 1`,
    [schoolId, section_id, subject_id]
  );
  const upcoming = await query(
    `SELECT * FROM planning.daily_lesson_plans
     WHERE school_id = $1 AND section_id = $2 AND subject_id = $3
       AND plan_date >= CURRENT_DATE AND status IN ('draft','submitted','reviewed')
     ORDER BY plan_date ASC, period_number ASC LIMIT 1`,
    [schoolId, section_id, subject_id]
  );
  return { last_taught: last.rows[0] || null, next_planned: upcoming.rows[0] || null };
};

export const getTeacherAssignments = async (schoolId, teacherUserId, { academic_year_id } = {}) => {
  const params = [schoolId, teacherUserId];
  let yearFilterTt = '';
  let yearFilterTa = '';
  if (academic_year_id) {
    params.push(academic_year_id);
    const yearIdx = params.length;
    yearFilterTt = ` AND COALESCE(ts.academic_year_id, c.academic_year_id) = $${yearIdx}`;
    yearFilterTa = ` AND c.academic_year_id = $${yearIdx}`;
  }

  const result = await query(
    `SELECT DISTINCT
            section_id,
            section_name,
            grade_id,
            grade_name,
            subject_id,
            subject_name,
            academic_year_id,
            academic_year_name,
            periods_per_week
     FROM (
       SELECT
         COALESCE(ts.section_id, c.section_id) AS section_id,
         sec.name AS section_name,
         g.id AS grade_id,
         g.name AS grade_name,
         ts.subject_id,
         sub.name AS subject_name,
         COALESCE(ts.academic_year_id, c.academic_year_id) AS academic_year_id,
         ay.name AS academic_year_name,
         cs.periods_per_week
       FROM academic.timetable_slots ts
       JOIN academic.classes c ON c.id = ts.class_id
       JOIN academic.sections sec ON sec.id = COALESCE(ts.section_id, c.section_id)
       JOIN academic.grades g ON g.id = sec.grade_id
       JOIN academic.subjects sub ON sub.id = ts.subject_id
       LEFT JOIN academic.academicyears ay ON ay.id = COALESCE(ts.academic_year_id, c.academic_year_id)
       LEFT JOIN academic.class_subjects cs
         ON cs.class_id = c.id AND cs.subject_id = ts.subject_id
       WHERE ts.school_id = $1 AND ts.teacher_id = $2${yearFilterTt}

       UNION

       SELECT
         ta.section_id,
         sec.name AS section_name,
         g.id AS grade_id,
         g.name AS grade_name,
         ta.subject_id,
         sub.name AS subject_name,
         c.academic_year_id,
         ay.name AS academic_year_name,
         cs.periods_per_week
       FROM academic.teacherassignments ta
       JOIN academic.sections sec ON sec.id = ta.section_id AND sec.school_id = $1
       JOIN academic.grades g ON g.id = sec.grade_id
       JOIN academic.subjects sub ON sub.id = ta.subject_id
       JOIN academic.classes c ON c.section_id = ta.section_id AND c.school_id = sec.school_id
       LEFT JOIN academic.academicyears ay ON ay.id = c.academic_year_id
       LEFT JOIN academic.class_subjects cs
         ON cs.class_id = c.id AND cs.subject_id = ta.subject_id
       WHERE ta.teacher_id = $2${yearFilterTa}
     ) assignments
     ORDER BY grade_name, section_name, subject_name`,
    params
  );
  return result.rows;
};

export const getUnitPlan = async (schoolId, unitId) => {
  const unit = await query(
    `SELECT up.*, ap.school_id, ap.teacher_id, ap.section_id, ap.subject_id, ap.term_id, ap.academic_year_id,
            sub.name AS subject_name, sec.name AS section_name
     FROM planning.unit_plans up
     JOIN planning.annual_plans ap ON ap.id = up.annual_plan_id
     JOIN academic.subjects sub ON sub.id = ap.subject_id
     JOIN academic.sections sec ON sec.id = ap.section_id
     WHERE up.id = $1 AND ap.school_id = $2`,
    [unitId, schoolId]
  );
  if (!unit.rows[0]) throw new AppError('Unit plan not found.', 404, ERROR_CODES.NOT_FOUND);

  const weeks = await query(
    `SELECT * FROM planning.weekly_plans WHERE unit_plan_id = $1 ORDER BY week_number`,
    [unitId]
  );
  return { ...unit.rows[0], weekly_plans: weeks.rows };
};

export const saveWeeklyPlansForUnit = async (schoolId, unitId, weeks = []) => {
  await getUnitPlan(schoolId, unitId);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM planning.weekly_plans WHERE unit_plan_id = $1`, [unitId]);
    for (const w of weeks) {
      await client.query(
        `INSERT INTO planning.weekly_plans (unit_plan_id, week_number, week_start_date, topics_summary, status)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          unitId,
          w.week_number,
          w.week_start_date || null,
          w.topics_summary || '',
          w.status || 'planned',
        ]
      );
    }
    await client.query('COMMIT');
    return getUnitPlan(schoolId, unitId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const getBehindScheduleReport = async (schoolId, { academic_year_id, term_id } = {}) => {
  const params = [schoolId];
  let yearFilter = '';
  if (academic_year_id) {
    params.push(academic_year_id);
    yearFilter += ` AND ap.academic_year_id = $${params.length}`;
  }
  if (term_id) {
    params.push(term_id);
    yearFilter += ` AND ap.term_id = $${params.length}`;
  }

  const [overdue, syllabusGaps, staleWeekly] = await Promise.all([
    query(
      `SELECT dlp.id, dlp.plan_date, dlp.topic, dlp.status, dlp.period_number,
              sub.name AS subject_name, sec.name AS section_name, g.name AS grade_name,
              u.first_name AS teacher_first_name, u.last_name AS teacher_last_name
       FROM planning.daily_lesson_plans dlp
       JOIN academic.subjects sub ON sub.id = dlp.subject_id
       JOIN academic.sections sec ON sec.id = dlp.section_id
       JOIN academic.grades g ON g.id = sec.grade_id
       JOIN identity.users u ON u.id = dlp.teacher_id
       WHERE dlp.school_id = $1
         AND dlp.plan_date < CURRENT_DATE
         AND dlp.status NOT IN ('taught', 'archived')
       ORDER BY dlp.plan_date ASC
       LIMIT 100`,
      [schoolId]
    ),
    query(
      `SELECT ap.id AS annual_plan_id, ap.status AS plan_status,
              sub.name AS subject_name, sec.name AS section_name, g.name AS grade_name,
              u.first_name AS teacher_first_name, u.last_name AS teacher_last_name,
              COALESCE(SUM(up.periods_allocated), 0)::int AS planned_periods,
              COUNT(dlp.id) FILTER (WHERE dlp.status = 'taught')::int AS taught_periods,
              GREATEST(0, COALESCE(SUM(up.periods_allocated), 0) - COUNT(dlp.id) FILTER (WHERE dlp.status = 'taught'))::int AS periods_behind
       FROM planning.annual_plans ap
       JOIN academic.subjects sub ON sub.id = ap.subject_id
       JOIN academic.sections sec ON sec.id = ap.section_id
       JOIN academic.grades g ON g.id = sec.grade_id
       JOIN identity.users u ON u.id = ap.teacher_id
       LEFT JOIN planning.unit_plans up ON up.annual_plan_id = ap.id
       LEFT JOIN planning.daily_lesson_plans dlp
         ON dlp.section_id = ap.section_id AND dlp.subject_id = ap.subject_id
        AND dlp.teacher_id = ap.teacher_id AND dlp.academic_year_id = ap.academic_year_id
       WHERE ap.school_id = $1 AND ap.status IN ('approved', 'submitted')${yearFilter}
       GROUP BY ap.id, sub.name, sec.name, g.name, u.first_name, u.last_name
       HAVING COALESCE(SUM(up.periods_allocated), 0) > COUNT(dlp.id) FILTER (WHERE dlp.status = 'taught')
       ORDER BY periods_behind DESC
       LIMIT 50`,
      params
    ),
    query(
      `SELECT wp.id, wp.week_number, wp.week_start_date, wp.status, wp.topics_summary,
              up.unit_title, up.unit_number, sub.name AS subject_name, sec.name AS section_name,
              u.first_name AS teacher_first_name, u.last_name AS teacher_last_name
       FROM planning.weekly_plans wp
       JOIN planning.unit_plans up ON up.id = wp.unit_plan_id
       JOIN planning.annual_plans ap ON ap.id = up.annual_plan_id
       JOIN academic.subjects sub ON sub.id = ap.subject_id
       JOIN academic.sections sec ON sec.id = ap.section_id
       JOIN identity.users u ON u.id = ap.teacher_id
       WHERE ap.school_id = $1
         AND wp.week_start_date IS NOT NULL
         AND wp.week_start_date < CURRENT_DATE
         AND wp.status != 'completed'${yearFilter}
       ORDER BY wp.week_start_date ASC
       LIMIT 50`,
      params
    ),
  ]);

  return {
    overdue_daily: overdue.rows,
    syllabus_gaps: syllabusGaps.rows,
    overdue_weekly: staleWeekly.rows,
    totals: {
      overdue_daily: overdue.rows.length,
      syllabus_gaps: syllabusGaps.rows.length,
      overdue_weekly: staleWeekly.rows.length,
    },
  };
};

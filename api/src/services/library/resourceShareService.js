import { query, getClient } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import { librarySchemaReady } from './resourceService.js';

const notReady = () => {
  throw new AppError(
    'Resource library is not installed. Run backend migrations (npm run migrate:psql).',
    503,
    ERROR_CODES.INVALID_OPERATION
  );
};

/**
 * Teacher must be assigned to the section (timetable or teacherassignments) for current year.
 */
export const assertTeacherAssignment = async ({ teacherId, sectionId, schoolId, academicYearId }) => {
  let yearId = academicYearId;
  if (!yearId) {
    const yearRow = await query(
      `SELECT id FROM academic.academicyears
       WHERE school_id = $1 AND is_current = true AND is_deleted = false
       LIMIT 1`,
      [schoolId]
    );
    yearId = yearRow.rows[0]?.id;
  }

  const params = [schoolId, teacherId, sectionId];
  let yearFilter = '';
  if (yearId) {
    params.push(yearId);
    yearFilter = ` AND c.academic_year_id = $${params.length}`;
  }

  const { rows } = await query(
    `SELECT ta.subject_id, sub.name AS subject_name
     FROM (
       SELECT ts.subject_id, COALESCE(ts.section_id, c.section_id) AS section_id
       FROM academic.timetable_slots ts
       JOIN academic.classes c ON c.id = ts.class_id
       WHERE ts.school_id = $1 AND ts.teacher_id = $2
         AND COALESCE(ts.section_id, c.section_id) = $3${yearFilter}

       UNION

       SELECT ta.subject_id, ta.section_id
       FROM academic.teacherassignments ta
       JOIN academic.sections sec ON sec.id = ta.section_id AND sec.school_id = $1
       JOIN academic.classes c ON c.section_id = ta.section_id AND c.school_id = sec.school_id
       WHERE ta.teacher_id = $2 AND ta.section_id = $3${yearFilter}
     ) ta
     JOIN academic.subjects sub ON sub.id = ta.subject_id
     LIMIT 1`,
    params
  );

  if (!rows[0]) {
    throw new AppError(
      'You are not assigned to teach this section. Only assigned teachers can share resources with it.',
      403,
      ERROR_CODES.FORBIDDEN
    );
  }

  return rows[0];
};

export const shareResourceToSections = async ({
  resourceId, sectionIds, teacherId, schoolId, note, isPinned = false, role,
}) => {
  if (!(await librarySchemaReady())) notReady();
  if (!sectionIds?.length) throw new AppError('At least one section is required.', 400);

  const resource = await query(
    `SELECT * FROM library.resources WHERE id = $1 AND deleted_at IS NULL`,
    [resourceId]
  );
  const r = resource.rows[0];
  if (!r) throw new AppError('Resource not found.', 404, ERROR_CODES.NOT_FOUND);
  if (r.school_id && r.school_id !== schoolId) {
    throw new AppError('Resource does not belong to your school.', 403, ERROR_CODES.FORBIDDEN);
  }
  if (r.status !== 'published') {
    throw new AppError('Only published resources can be shared.', 400);
  }

  const assignments = [];
  for (const sectionId of sectionIds) {
    if (role === 'TEACHER') {
      const assignment = await assertTeacherAssignment({ teacherId, sectionId, schoolId });
      assignments.push({ sectionId, subject_id: assignment.subject_id });
    } else {
      assignments.push({ sectionId, subject_id: null });
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const { sectionId, subject_id } of assignments) {
      const result = await client.query(
        `INSERT INTO library.resource_section_shares (
           school_id, resource_id, section_id, subject_id, shared_by, note, is_pinned, deleted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
         ON CONFLICT (resource_id, section_id) DO UPDATE SET
           note = EXCLUDED.note,
           is_pinned = EXCLUDED.is_pinned,
           deleted_at = NULL,
           shared_by = EXCLUDED.shared_by,
           shared_at = now()
         RETURNING *`,
        [schoolId, resourceId, sectionId, subject_id, teacherId, note || null, isPinned]
      );
      created.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const unshareResource = async ({ shareId, requesterId, role, schoolId }) => {
  if (!(await librarySchemaReady())) notReady();

  const { rows } = await query(
    `SELECT * FROM library.resource_section_shares
     WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
    [shareId, schoolId]
  );
  const share = rows[0];
  if (!share) throw new AppError('Share not found.', 404, ERROR_CODES.NOT_FOUND);

  if (role === 'TEACHER' && share.shared_by !== requesterId) {
    throw new AppError('You can only remove shares you created.', 403, ERROR_CODES.FORBIDDEN);
  }

  await query(
    `UPDATE library.resource_section_shares SET deleted_at = now() WHERE id = $1`,
    [shareId]
  );
  return { success: true, shareId };
};

export const togglePin = async ({ shareId, requesterId, role, schoolId }) => {
  if (!(await librarySchemaReady())) notReady();

  const { rows } = await query(
    `SELECT * FROM library.resource_section_shares
     WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
    [shareId, schoolId]
  );
  const share = rows[0];
  if (!share) throw new AppError('Share not found.', 404, ERROR_CODES.NOT_FOUND);

  if (role === 'TEACHER' && share.shared_by !== requesterId) {
    throw new AppError('You can only pin your own shares.', 403, ERROR_CODES.FORBIDDEN);
  }

  if (!share.is_pinned) {
    const pinnedCount = await query(
      `SELECT COUNT(*)::int AS cnt FROM library.resource_section_shares
       WHERE section_id = $1 AND is_pinned = true AND deleted_at IS NULL`,
      [share.section_id]
    );
    if ((pinnedCount.rows[0]?.cnt || 0) >= 5) {
      throw new AppError('Maximum 5 pinned resources per section.', 400);
    }
  }

  const { rows: updated } = await query(
    `UPDATE library.resource_section_shares
     SET is_pinned = NOT is_pinned,
         unpinned_at = CASE WHEN is_pinned THEN now() ELSE NULL END
     WHERE id = $1
     RETURNING *`,
    [shareId]
  );
  return updated[0];
};

export const getSectionLibrary = async ({ sectionId, schoolId, filters = {} }) => {
  if (!(await librarySchemaReady())) notReady();

  const { category_id, subject_id, search, page = 1, limit = 24 } = filters;
  const pageLimit = Math.min(100, Number(limit) || 24);
  const offset = (Math.max(1, Number(page)) - 1) * pageLimit;

  const params = [sectionId, schoolId];
  let extraSection = '';
  let extraGlobal = '';

  if (category_id) {
    params.push(category_id);
    extraSection += ` AND r.category_id = $${params.length}`;
    extraGlobal += ` AND r.category_id = $${params.length}`;
  }
  if (subject_id) {
    params.push(subject_id);
    extraSection += ` AND r.subject_id = $${params.length}`;
    extraGlobal += ` AND r.subject_id = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    extraSection += ` AND (r.title ILIKE ${p} OR r.title_am ILIKE ${p})`;
    extraGlobal += ` AND (r.title ILIKE ${p} OR r.title_am ILIKE ${p})`;
  }

  params.push(pageLimit, offset);

  const { rows } = await query(
    `WITH combined AS (
       SELECT
         r.id, r.title, r.title_am, r.description, r.file_type, r.thumbnail_url,
         r.external_url, r.language, r.view_count, r.download_count, r.created_at,
         rc.name AS category_name, rc.icon AS category_icon,
         rss.id AS share_id, rss.note AS share_note, rss.is_pinned, rss.shared_at,
         'section'::text AS source
       FROM library.resources r
       JOIN library.resource_section_shares rss ON rss.resource_id = r.id
       JOIN library.resource_categories rc ON rc.id = r.category_id
       WHERE rss.section_id = $1 AND rss.school_id = $2
         AND rss.deleted_at IS NULL AND r.deleted_at IS NULL AND r.status = 'published'
         ${extraSection}

       UNION ALL

       SELECT
         r.id, r.title, r.title_am, r.description, r.file_type, r.thumbnail_url,
         r.external_url, r.language, r.view_count, r.download_count, r.created_at,
         rc.name AS category_name, rc.icon AS category_icon,
         NULL::uuid AS share_id, NULL::text AS share_note, false AS is_pinned,
         r.created_at AS shared_at,
         'global'::text AS source
       FROM library.resources r
       JOIN library.resource_categories rc ON rc.id = r.category_id
       WHERE r.school_id IS NULL AND r.status = 'published' AND r.deleted_at IS NULL
         ${extraGlobal}
     )
     SELECT * FROM combined
     ORDER BY is_pinned DESC, shared_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows;
};

export const getTeacherShareableSections = async ({ teacherId, schoolId }) => {
  if (!(await librarySchemaReady())) return [];

  const yearRow = await query(
    `SELECT id FROM academic.academicyears
     WHERE school_id = $1 AND is_current = true AND is_deleted = false LIMIT 1`,
    [schoolId]
  );
  const yearId = yearRow.rows[0]?.id;

  const params = [schoolId, teacherId];
  let yearFilter = '';
  if (yearId) {
    params.push(yearId);
    yearFilter = ` AND c.academic_year_id = $${params.length}`;
  }

  const { rows } = await query(
    `SELECT DISTINCT ON (section_id, subject_id)
       section_id, section_name, grade_id, grade_name, subject_id, subject_name
     FROM (
       SELECT
         COALESCE(ts.section_id, c.section_id) AS section_id,
         sec.name AS section_name,
         g.id AS grade_id,
         g.name AS grade_name,
         ts.subject_id,
         sub.name AS subject_name,
         g.level_order
       FROM academic.timetable_slots ts
       JOIN academic.classes c ON c.id = ts.class_id
       JOIN academic.sections sec ON sec.id = COALESCE(ts.section_id, c.section_id)
       JOIN academic.grades g ON g.id = sec.grade_id
       JOIN academic.subjects sub ON sub.id = ts.subject_id
       WHERE ts.school_id = $1 AND ts.teacher_id = $2${yearFilter}

       UNION

       SELECT
         ta.section_id,
         sec.name AS section_name,
         g.id AS grade_id,
         g.name AS grade_name,
         ta.subject_id,
         sub.name AS subject_name,
         g.level_order
       FROM academic.teacherassignments ta
       JOIN academic.sections sec ON sec.id = ta.section_id AND sec.school_id = $1
       JOIN academic.grades g ON g.id = sec.grade_id
       JOIN academic.subjects sub ON sub.id = ta.subject_id
       JOIN academic.classes c ON c.section_id = ta.section_id AND c.school_id = sec.school_id
       WHERE ta.teacher_id = $2${yearFilter}
     ) assignments
     ORDER BY section_id, subject_id, level_order, section_name`,
    params
  );

  return rows;
};

export const listResourceShares = async (schoolId, resourceId) => {
  if (!(await librarySchemaReady())) notReady();

  const { rows } = await query(
    `SELECT rss.id AS share_id, rss.note, rss.is_pinned, rss.shared_at,
            sec.id AS section_id, sec.name AS section_name,
            g.name AS grade_name,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS shared_by_name
     FROM library.resource_section_shares rss
     JOIN academic.sections sec ON sec.id = rss.section_id
     JOIN academic.grades g ON g.id = sec.grade_id
     LEFT JOIN identity.users u ON u.id = rss.shared_by
     WHERE rss.resource_id = $1 AND rss.school_id = $2 AND rss.deleted_at IS NULL
     ORDER BY rss.shared_at DESC`,
    [resourceId, schoolId]
  );
  return rows;
};

export const verifyStudentSectionAccess = async (studentUserId, sectionId) => {
  const { rows } = await query(
    `SELECT se.id
     FROM student.studentenrollments se
     JOIN student.students s ON s.id = se.student_id
     WHERE s.user_id = $1 AND se.section_id = $2 AND se.status = 'active'
     LIMIT 1`,
    [studentUserId, sectionId]
  );
  return Boolean(rows[0]);
};

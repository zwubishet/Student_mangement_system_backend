import { query, getClient } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';

export const librarySchemaReady = async () => {
  const { rows } = await query(
    `SELECT to_regclass('library.resources') IS NOT NULL AS ready`
  );
  return Boolean(rows[0]?.ready);
};

const notReady = () => {
  throw new AppError(
    'Resource library is not installed. Run backend migrations (npm run migrate:psql).',
    503,
    ERROR_CODES.INVALID_OPERATION
  );
};

const FILE_TYPE_MAP = {
  'application/pdf': 'pdf',
  'video/mp4': 'video',
  'video/webm': 'video',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

export const inferFileType = (mimeType, externalUrl) => {
  if (externalUrl) return 'link';
  return FILE_TYPE_MAP[mimeType] || 'file';
};

export const listCategories = async () => {
  if (!(await librarySchemaReady())) return [];
  const { rows } = await query(
    `SELECT * FROM library.resource_categories ORDER BY sort_order, name`
  );
  return rows;
};

export const getOverview = async (schoolId) => {
  if (!(await librarySchemaReady())) {
    return {
      library_ready: false,
      message: 'Resource library database tables are not installed. Run backend migrations (npm run migrate:psql).',
      stats: { total: 0, pending: 0, global: 0, shared: 0, books: 0 },
    };
  }

  const [schoolStats, globalStats, shareStats, bookStats] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'published')::int AS published,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*)::int AS total
       FROM library.resources
       WHERE school_id = $1 AND deleted_at IS NULL`,
      [schoolId]
    ),
    query(
      `SELECT COUNT(*)::int AS global
       FROM library.resources
       WHERE school_id IS NULL AND status = 'published' AND deleted_at IS NULL`
    ),
    query(
      `SELECT COUNT(DISTINCT resource_id)::int AS shared
       FROM library.resource_section_shares
       WHERE school_id = $1 AND deleted_at IS NULL`,
      [schoolId]
    ),
    query(
      `SELECT COUNT(*)::int AS books
       FROM library.library_books
       WHERE school_id = $1 AND deleted_at IS NULL`,
      [schoolId]
    ),
  ]);

  return {
    library_ready: true,
    stats: {
      total: schoolStats.rows[0]?.total || 0,
      pending: schoolStats.rows[0]?.pending || 0,
      published: schoolStats.rows[0]?.published || 0,
      global: globalStats.rows[0]?.global || 0,
      shared: shareStats.rows[0]?.shared || 0,
      books: bookStats.rows[0]?.books || 0,
    },
  };
};

const resourceSelect = `
  SELECT r.*,
         rc.name AS category_name, rc.name_am AS category_name_am, rc.icon AS category_icon,
         g.name AS grade_name,
         sub.name AS subject_name,
         TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS uploaded_by_name,
         f.file_url, f.mime_type, f.status AS file_status
  FROM library.resources r
  JOIN library.resource_categories rc ON rc.id = r.category_id
  LEFT JOIN academic.grades g ON g.id = r.grade_id
  LEFT JOIN academic.subjects sub ON sub.id = r.subject_id
  LEFT JOIN identity.users u ON u.id = r.uploaded_by
  LEFT JOIN infrastructure.files f ON f.id = r.file_id
`;

export const listResources = async (schoolId, filters = {}, role = 'SCHOOL_ADMIN') => {
  if (!(await librarySchemaReady())) notReady();

  const {
    scope = 'all',
    status,
    category_id,
    grade_id,
    subject_id,
    search,
    page = 1,
    limit = 24,
    uploaded_by,
  } = filters;

  const params = [];
  const where = ['r.deleted_at IS NULL'];
  let paramIdx = 0;

  const addParam = (val) => {
    params.push(val);
    paramIdx += 1;
    return `$${paramIdx}`;
  };

  if (scope === 'global') {
    where.push('r.school_id IS NULL');
    where.push("r.status = 'published'");
  } else if (scope === 'school') {
    where.push(`r.school_id = ${addParam(schoolId)}`);
  } else {
    where.push(`(r.school_id IS NULL OR r.school_id = ${addParam(schoolId)})`);
  }

  if (status) {
    where.push(`r.status = ${addParam(status)}`);
  } else if (role === 'STUDENT' || role === 'PARENT') {
    where.push("r.status = 'published'");
  } else if (role === 'TEACHER' && !status) {
    where.push(`(r.status = 'published' OR r.uploaded_by = ${addParam(filters.userId || null)})`);
  }

  if (category_id) where.push(`r.category_id = ${addParam(category_id)}`);
  if (grade_id) where.push(`r.grade_id = ${addParam(grade_id)}`);
  if (subject_id) where.push(`r.subject_id = ${addParam(subject_id)}`);
  if (uploaded_by) where.push(`r.uploaded_by = ${addParam(uploaded_by)}`);
  if (search) {
    const p = addParam(`%${search}%`);
    where.push(`(r.title ILIKE ${p} OR r.title_am ILIKE ${p} OR r.description ILIKE ${p})`);
  }

  const offset = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit) || 24);
  const pageLimit = Math.min(100, Number(limit) || 24);

  const countSql = `SELECT COUNT(*)::int AS total FROM library.resources r WHERE ${where.join(' AND ')}`;
  const listSql = `${resourceSelect}
    WHERE ${where.join(' AND ')}
    ORDER BY r.created_at DESC
    LIMIT ${pageLimit} OFFSET ${offset}`;

  const [countRes, listRes] = await Promise.all([
    query(countSql, params),
    query(listSql, params),
  ]);

  return {
    items: listRes.rows,
    total: countRes.rows[0]?.total || 0,
    page: Number(page),
    limit: pageLimit,
  };
};

export const getResource = async (schoolId, resourceId, role = 'SCHOOL_ADMIN', userId = null) => {
  if (!(await librarySchemaReady())) notReady();

  const { rows } = await query(
    `${resourceSelect} WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [resourceId]
  );
  const resource = rows[0];
  if (!resource) throw new AppError('Resource not found.', 404, ERROR_CODES.NOT_FOUND);

  if (resource.school_id && resource.school_id !== schoolId) {
    throw new AppError('Access denied.', 403, ERROR_CODES.FORBIDDEN);
  }

  if (['STUDENT', 'PARENT'].includes(role) && resource.status !== 'published') {
    throw new AppError('Resource not available.', 403, ERROR_CODES.FORBIDDEN);
  }

  if (role === 'TEACHER' && resource.status !== 'published' && resource.uploaded_by !== userId) {
    throw new AppError('Resource not available.', 403, ERROR_CODES.FORBIDDEN);
  }

  return resource;
};

export const createResource = async (schoolId, body, userId, role) => {
  if (!(await librarySchemaReady())) notReady();

  const {
    title, title_am, description, category_id, grade_id, subject_id,
    academic_year_id, language, keywords, external_url, file_id,
    file_name, file_size_bytes, file_type, access_level, is_global,
  } = body;

  if (!title?.trim()) throw new AppError('Title is required.', 400);
  if (!category_id) throw new AppError('Category is required.', 400);
  if (!file_id && !external_url) {
    throw new AppError('Upload a file or provide an external URL.', 400);
  }

  const isGlobal = role === 'SUPER_ADMIN' && is_global === true;
  const autoPublish = ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(role);
  const status = autoPublish ? 'published' : 'pending';

  if (file_id && !isGlobal) {
    const fileRow = await query(
      `SELECT id, status, school_id FROM infrastructure.files
       WHERE id = $1 AND school_id = $2 AND status = 'ready'`,
      [file_id, schoolId]
    );
    if (!fileRow.rows[0]) {
      throw new AppError('File not found or not ready.', 400);
    }
  }

  const { rows } = await query(
    `INSERT INTO library.resources (
       school_id, category_id, grade_id, subject_id, academic_year_id,
       title, title_am, description, language, keywords,
       file_type, file_id, file_name, file_size_bytes, external_url,
       access_level, status, uploaded_by, approved_by, approved_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
     ) RETURNING *`,
    [
      isGlobal ? null : schoolId,
      category_id,
      grade_id || null,
      subject_id || null,
      academic_year_id || null,
      title.trim(),
      title_am || null,
      description || null,
      language || 'english',
      keywords?.length ? keywords : null,
      file_type || (external_url ? 'link' : null),
      file_id || null,
      file_name || null,
      file_size_bytes || null,
      external_url || null,
      access_level || 'school',
      status,
      userId,
      autoPublish ? userId : null,
      autoPublish ? new Date() : null,
    ]
  );

  return getResource(isGlobal ? schoolId : schoolId, rows[0].id, role, userId);
};

export const reviewResource = async (schoolId, resourceId, { status, rejection_reason }, userId) => {
  if (!(await librarySchemaReady())) notReady();
  if (!['published', 'archived'].includes(status)) {
    throw new AppError('Invalid status.', 400);
  }

  const { rows } = await query(
    `UPDATE library.resources
     SET status = $1,
         rejection_reason = $2,
         approved_by = CASE WHEN $1 = 'published' THEN $3 ELSE NULL END,
         approved_at = CASE WHEN $1 = 'published' THEN now() ELSE NULL END,
         updated_at = now()
     WHERE id = $4 AND school_id = $5 AND deleted_at IS NULL
     RETURNING id`,
    [status, rejection_reason || null, userId, resourceId, schoolId]
  );

  if (!rows[0]) throw new AppError('Resource not found.', 404, ERROR_CODES.NOT_FOUND);
  return getResource(schoolId, resourceId);
};

export const softDeleteResource = async (schoolId, resourceId, userId, role) => {
  if (!(await librarySchemaReady())) notReady();

  const resource = await getResource(schoolId, resourceId, role, userId);
  if (role === 'TEACHER' && resource.uploaded_by !== userId) {
    throw new AppError('You can only delete your own resources.', 403, ERROR_CODES.FORBIDDEN);
  }

  await query(
    `UPDATE library.resources SET deleted_at = now(), updated_at = now() WHERE id = $1`,
    [resourceId]
  );
  return { success: true };
};

export const getResourceAccess = async (schoolId, resourceId, userId, role, { action = 'view', ip } = {}) => {
  const resource = await getResource(schoolId, resourceId, role, userId);

  if (resource.access_level === 'teachers' && !['TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new AppError('Teachers only resource.', 403, ERROR_CODES.FORBIDDEN);
  }

  await query(
    `INSERT INTO library.resource_access_logs (resource_id, user_id, school_id, action, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [resourceId, userId, schoolId, action, ip || null]
  );

  const countField = action === 'download' ? 'download_count' : 'view_count';
  await query(
    `UPDATE library.resources SET ${countField} = ${countField} + 1, updated_at = now() WHERE id = $1`,
    [resourceId]
  );

  if (resource.external_url) {
    return { url: resource.external_url, type: 'external' };
  }

  if (resource.file_url) {
    return { url: resource.file_url, type: 'file', mime_type: resource.mime_type };
  }

  throw new AppError('No file associated with this resource.', 400);
};

export const toggleBookmark = async (schoolId, resourceId, userId) => {
  if (!(await librarySchemaReady())) notReady();

  const existing = await query(
    `SELECT id FROM library.resource_bookmarks WHERE user_id = $1 AND resource_id = $2`,
    [userId, resourceId]
  );

  if (existing.rows[0]) {
    await query(`DELETE FROM library.resource_bookmarks WHERE id = $1`, [existing.rows[0].id]);
    return { bookmarked: false };
  }

  await query(
    `INSERT INTO library.resource_bookmarks (user_id, resource_id, school_id) VALUES ($1, $2, $3)`,
    [userId, resourceId, schoolId]
  );
  return { bookmarked: true };
};

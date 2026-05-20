import { query } from '../../config/db.js';
import { getPaginationParams } from '../../utils/pagination.js';

export const listComputedResults = async (schoolId, filters) => {
  const { page, limit, offset } = getPaginationParams(filters);
  const { exam_id, term_id, class_id, subject_id, result_scope } = filters;

  const conditions = ['cr.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (exam_id) { conditions.push(`cr.exam_id = $${idx++}`); params.push(exam_id); }
  if (term_id) { conditions.push(`cr.term_id = $${idx++}`); params.push(term_id); }
  if (class_id) { conditions.push(`cr.class_id = $${idx++}`); params.push(class_id); }
  if (subject_id) { conditions.push(`cr.subject_id = $${idx++}`); params.push(subject_id); }
  if (result_scope) { conditions.push(`cr.result_scope = $${idx++}`); params.push(result_scope); }

  const where = conditions.join(' AND ');

  const [rows, count] = await Promise.all([
    query(
      `SELECT cr.*, s.first_name, s.last_name, s.admission_number,
              sub.name AS subject_name, c.name AS class_name
       FROM operations.computed_results cr
       JOIN student.students s ON s.id = cr.student_id
       LEFT JOIN academic.subjects sub ON sub.id = cr.subject_id
       LEFT JOIN academic.classes c ON c.id = cr.class_id
       WHERE ${where}
       ORDER BY cr.rank_in_class NULLS LAST, s.last_name, s.first_name
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM operations.computed_results cr WHERE ${where}`, params),
  ]);

  return {
    rows: rows.rows,
    total: parseInt(count.rows[0].count, 10),
    page,
    limit,
  };
};

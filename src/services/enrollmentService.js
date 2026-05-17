import { getClient, query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { logStudentActivity } from '../utils/entityActivity.js';

const assertStudent = async (client, schoolId, studentId) => {
  const r = await client.query(
    `SELECT id FROM student.students WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
    [studentId, schoolId]
  );
  if (!r.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
};

const checkCapacity = async (client, schoolId, sectionId, academicYearId) => {
  const cap = await client.query(
    `SELECT c.capacity, COUNT(e.id)::int AS current_enrollment
     FROM academic.classes c
     LEFT JOIN student.studentenrollments e
       ON c.section_id = e.section_id AND c.academic_year_id = e.academic_year_id AND e.status = 'active'
     WHERE c.section_id = $1 AND c.academic_year_id = $2 AND c.school_id = $3
     GROUP BY c.capacity`,
    [sectionId, academicYearId, schoolId]
  );
  if (!cap.rows[0]) throw new AppError('Class not activated for this academic year.', 400, ERROR_CODES.NOT_FOUND);
  if (cap.rows[0].current_enrollment >= cap.rows[0].capacity) {
    throw new AppError(`Classroom full: capacity ${cap.rows[0].capacity}.`, 400, ERROR_CODES.CAPACITY_EXCEEDED);
  }
  return cap.rows[0].capacity - cap.rows[0].current_enrollment - 1;
};

/** Transfer or promote: close active enrollment, open new section/year. */
export const transferStudentEnrollment = async (
  schoolId,
  studentId,
  { section_id, academic_year_id, reason = 'transfer' },
  actorId
) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await assertStudent(client, schoolId, studentId);

    const active = await client.query(
      `SELECT id, section_id, academic_year_id FROM student.studentenrollments
       WHERE student_id = $1 AND school_id = $2 AND status = 'active' LIMIT 1`,
      [studentId, schoolId]
    );

    if (active.rows[0]) {
      const status = reason === 'promote' ? 'promoted' : 'transferred';
      await client.query(
        `UPDATE student.studentenrollments SET status = $1 WHERE id = $2`,
        [status, active.rows[0].id]
      );
    }

    await checkCapacity(client, schoolId, section_id, academic_year_id);

    const enroll = await client.query(
      `INSERT INTO student.studentenrollments (school_id, student_id, section_id, academic_year_id, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [schoolId, studentId, section_id, academic_year_id]
    );

    await client.query('COMMIT');

    const action = reason === 'promote' ? 'PROMOTED' : 'TRANSFERRED';
    audit({
      userId: actorId,
      schoolId,
      action: AUDIT_ACTIONS.UPDATE,
      entity: 'student_enrollment',
      entityId: enroll.rows[0].id,
      meta: { studentId, section_id, academic_year_id, reason },
    });
    logStudentActivity({
      schoolId,
      studentId,
      actorId,
      action,
      meta: { section_id, academic_year_id, from: active.rows[0] || null },
    });

    return { enrollment_id: enroll.rows[0].id, section_id, academic_year_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const withdrawStudentEnrollment = async (schoolId, studentId, { note }, actorId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await assertStudent(client, schoolId, studentId);

    const result = await client.query(
      `UPDATE student.studentenrollments SET status = 'withdrawn'
       WHERE student_id = $1 AND school_id = $2 AND status = 'active'
       RETURNING id`,
      [studentId, schoolId]
    );
    if (!result.rows[0]) {
      throw new AppError('No active enrollment to withdraw.', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    await client.query('COMMIT');
    audit({
      userId: actorId,
      schoolId,
      action: AUDIT_ACTIONS.UNENROLL,
      entity: 'student',
      entityId: studentId,
      meta: { note },
    });
    logStudentActivity({ schoolId, studentId, actorId, action: 'WITHDRAWN', meta: { note } });
    return { enrollment_id: result.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

import { query } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import * as examService from '../examService.js';

/**
 * Parse CSV: admission_number or student_id, score, is_absent, notes
 * @param {string} csvText
 */
export function parseMarksCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    throw new AppError('CSV must have a header row and at least one data row.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const idIdx = header.findIndex((h) => ['student_id', 'admission_number', 'admission_no', 'id'].includes(h));
  const scoreIdx = header.findIndex((h) => ['score', 'marks', 'mark'].includes(h));
  const absentIdx = header.findIndex((h) => ['is_absent', 'absent'].includes(h));
  const notesIdx = header.findIndex((h) => ['notes', 'teacher_notes', 'remark'].includes(h));

  if (idIdx < 0 || scoreIdx < 0) {
    throw new AppError('CSV header must include student_id or admission_number and score columns.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const rows = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const idVal = cols[idIdx];
    if (!idVal) continue;
    const key = idVal.toLowerCase();
    if (seen.has(key)) {
      throw new AppError(`Duplicate student identifier in CSV at line ${i + 1}: ${idVal}`, 400, ERROR_CODES.VALIDATION_ERROR);
    }
    seen.add(key);

    const absentRaw = absentIdx >= 0 ? cols[absentIdx]?.toLowerCase() : '';
    const isAbsent = ['1', 'true', 'yes', 'y', 'abs'].includes(absentRaw);

    rows.push({
      line: i + 1,
      identifier: idVal,
      score: isAbsent ? null : (cols[scoreIdx] === '' ? null : Number(cols[scoreIdx])),
      is_absent: isAbsent,
      teacher_notes: notesIdx >= 0 ? cols[notesIdx] || null : null,
    });
  }

  return rows;
}

export const dryRunBulkMarks = async (schoolId, examId, scheduleId, csvText) => {
  const parsed = parseMarksCsv(csvText);
  const sheet = await examService.getMarkEntrySheet(schoolId, examId, scheduleId);
  const maxScore = Number(sheet.max_score) || 100;

  const byAdmission = new Map(
    sheet.students.map((s) => [String(s.admission_number).toLowerCase(), s])
  );
  const byId = new Map(sheet.students.map((s) => [String(s.id).toLowerCase(), s]));

  const preview = [];
  const errors = [];

  for (const row of parsed) {
    const student =
      byId.get(row.identifier.toLowerCase()) ||
      byAdmission.get(row.identifier.toLowerCase());

    if (!student) {
      errors.push({ line: row.line, message: `Student not found in class: ${row.identifier}` });
      continue;
    }

    if (!row.is_absent && row.score != null) {
      if (Number.isNaN(row.score) || row.score < 0 || row.score > maxScore) {
        errors.push({ line: row.line, message: `Score out of range 0–${maxScore}: ${row.score}` });
        continue;
      }
    }

    preview.push({
      student_id: student.id,
      admission_number: student.admission_number,
      name: `${student.first_name} ${student.last_name}`,
      score: row.score,
      is_absent: row.is_absent,
      teacher_notes: row.teacher_notes,
      current_score: student.score,
      current_status: student.mark_status || 'draft',
    });
  }

  return {
    valid_count: preview.length,
    error_count: errors.length,
    preview,
    errors,
    max_score: maxScore,
  };
};

export const commitBulkMarks = async (schoolId, examId, scheduleId, csvText, actorId) => {
  const dry = await dryRunBulkMarks(schoolId, examId, scheduleId, csvText);
  if (dry.error_count > 0) {
    throw new AppError(
      `CSV has ${dry.error_count} error(s). Fix and retry or use dry-run preview.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const results = dry.preview.map((p) => ({
    student_id: p.student_id,
    score: p.score,
    is_absent: p.is_absent,
    teacher_notes: p.teacher_notes,
  }));

  const saved = await examService.submitMarks(schoolId, examId, scheduleId, { results }, actorId);
  return { ...saved, imported: results.length };
};

import PDFDocument from 'pdfkit';
import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { getTemplateBundle } from './pdfTemplateService.js';
import { getStudentGradeReport } from './grading/gradingReadService.js';

const fetchStudentMeta = async (schoolId, studentId, termId = null) => {
  const result = await query(
    `SELECT s.id, s.first_name, s.last_name, s.admission_number,
            sch.name AS school_name,
            g.name AS grade_name, sec.name AS section_name,
            ay.name AS academic_year
     FROM student.students s
     JOIN tenancy.schools sch ON sch.id = s.school_id
     LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
     LEFT JOIN academic.sections sec ON sec.id = se.section_id
     LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.academic_year_id = se.academic_year_id
     LEFT JOIN academic.grades g ON g.id = c.grade_id
     LEFT JOIN academic.academicyears ay ON ay.id = se.academic_year_id
     WHERE s.id = $1 AND s.school_id = $2 AND s.deleted_at IS NULL`,
    [studentId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  const meta = result.rows[0];
  if (termId) {
    const term = await query(
      `SELECT t.name FROM academic.terms t
       JOIN academic.academicyears ay ON ay.id = t.academic_year_id
       WHERE t.id = $1 AND ay.school_id = $2`,
      [termId, schoolId]
    );
    meta.term_name = term.rows[0]?.name;
    meta.term_id = termId;
  }
  return meta;
};

export const buildStudentReportCardPdf = async (schoolId, studentId, { term_id } = {}) => {
  const meta = await fetchStudentMeta(schoolId, studentId, term_id || null);
  const report = await getStudentGradeReport(schoolId, studentId, { term_id });

  if (!term_id && report.terms?.[0]) {
    meta.term_name = report.terms[0].name;
  }

  const { template, school } = await getTemplateBundle(schoolId, 'report_card');
  const brand = template.primary_color || '#059669';
  const summary = report.summary || {};

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor(brand).text(template.header_text || school?.name || 'School', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).fillColor('#0f172a').text(template.title || 'STUDENT REPORT CARD', { align: 'center' });
    doc.moveDown(0.8);

    doc.fontSize(11).fillColor('#334155');
    doc.text(`Student: ${meta.first_name} ${meta.last_name}`);
    doc.text(`Admission #: ${meta.admission_number || '—'}`);
    doc.text(`Class: ${meta.grade_name || '—'} · ${meta.section_name || '—'}`);
    doc.text(`Term: ${meta.term_name || 'All terms'} · Year: ${meta.academic_year || '—'}`);
    if (summary.average_percent != null) {
      doc.text(`Average: ${summary.average_percent}% · Marks: ${summary.total_marks ?? 0}`);
    }
    doc.moveDown(0.8);

    doc.fontSize(12).fillColor(brand).text('Exam results', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#475569');

    const marks = report.exam_marks || [];
    if (!marks.length) {
      doc.text('No published exam results for this period.');
    } else {
      for (const m of marks) {
        const line = m.is_absent
          ? `${m.subject_name || 'Subject'} — ${m.exam_name}: Absent`
          : `${m.subject_name || 'Subject'} — ${m.exam_name}: ${m.score}/${m.max_score} (${m.percent ?? '—'}%) ${m.letter_grade || ''}`;
        doc.text(line);
      }
    }

    const termRows = report.term_results?.length ? report.term_results : report.computed_results;
    if (termRows?.length) {
      doc.moveDown(0.8);
      doc.fontSize(12).fillColor(brand).text('Term summary', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor('#475569');
      for (const r of termRows) {
        doc.text(
          `${r.subject_name || 'Overall'}: ${r.grade_letter || '—'} · ${r.percentage != null ? `${Number(r.percentage).toFixed(1)}%` : '—'}${r.rank_in_class ? ` · Rank ${r.rank_in_class}` : ''}`
        );
      }
    }

    if (template.footer_text) {
      doc.moveDown(1.2);
      doc.fontSize(8).fillColor('#94a3b8').text(template.footer_text, { align: 'center' });
    }
    doc.end();
  });
};

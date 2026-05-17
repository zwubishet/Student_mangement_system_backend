import PDFDocument from 'pdfkit';
import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { getTemplateBundle } from './pdfTemplateService.js';

export const buildStudentIdCardPdf = async (schoolId, studentId) => {
  const result = await query(
    `SELECT s.admission_number, s.first_name, s.last_name, s.gender, s.date_of_birth,
            u.email, sch.name AS school_name,
            g.name AS grade_name, sec.name AS section_name, ay.name AS academic_year
     FROM student.students s
     JOIN identity.users u ON u.id = s.user_id
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
  const s = result.rows[0];
  const { template } = await getTemplateBundle(schoolId, 'id_card');
  const brand = template.primary_color || '#059669';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [242.65, 153.07], margin: 12 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(10).fillColor(brand).text(template.header_text || s.school_name || 'School', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).fillColor('#0f172a').text(template.title || 'STUDENT ID CARD', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`${s.first_name} ${s.last_name}`, { align: 'center' });
    doc.fontSize(9).fillColor('#475569');
    doc.text(`Admission: ${s.admission_number || '—'}`, { align: 'center' });
    doc.text(`${s.grade_name || '—'} · ${s.section_name || '—'}`, { align: 'center' });
    doc.text(`Year: ${s.academic_year || '—'}`, { align: 'center' });
    doc.text(`Gender: ${s.gender || '—'}`, { align: 'center' });
    if (template.footer_text) {
      doc.moveDown(0.3).fontSize(7).text(template.footer_text, { align: 'center' });
    }
    doc.end();
  });
};

export const buildStudentProfilePdf = async (schoolId, studentId) => {
  const result = await query(
    `SELECT s.*, u.email, sch.name AS school_name
     FROM student.students s
     JOIN identity.users u ON u.id = s.user_id
     JOIN tenancy.schools sch ON sch.id = s.school_id
     WHERE s.id = $1 AND s.school_id = $2`,
    [studentId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  const s = result.rows[0];
  const { template } = await getTemplateBundle(schoolId, 'profile');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).fillColor(template.primary_color || '#059669').text(template.header_text || s.school_name || 'School', { underline: true });
    doc.moveDown();
    doc.fontSize(14).text(`Student Profile: ${s.first_name} ${s.last_name}`);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Admission #: ${s.admission_number || '—'}`);
    doc.text(`Email: ${s.email || '—'}`);
    doc.text(`Phone: ${s.phone || '—'}`);
    doc.text(`Gender: ${s.gender || '—'}`);
    doc.text(`Status: ${s.lifecycle_status || 'active'}`);
    doc.text(`Emergency: ${s.emergency_contact_name || '—'} ${s.emergency_contact_phone || ''}`);
    doc.end();
  });
};

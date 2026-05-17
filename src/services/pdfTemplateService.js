import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';

export const TEMPLATE_KEYS = ['id_card', 'profile', 'report_card'];

export const listPdfTemplates = async (schoolId) => {
  const result = await query(
    `SELECT * FROM tenancy.school_pdf_templates WHERE school_id = $1 ORDER BY template_key`,
    [schoolId]
  ).catch(() => ({ rows: [] }));
  return result.rows;
};

export const getPdfTemplate = async (schoolId, templateKey) => {
  const result = await query(
    `SELECT * FROM tenancy.school_pdf_templates WHERE school_id = $1 AND template_key = $2`,
    [schoolId, templateKey]
  );
  return result.rows[0] || null;
};

export const upsertPdfTemplate = async (schoolId, templateKey, data, actorId) => {
  if (!TEMPLATE_KEYS.includes(templateKey)) {
    throw new AppError('Invalid template key.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const result = await query(
    `INSERT INTO tenancy.school_pdf_templates (
       school_id, template_key, title, header_text, footer_text, primary_color, logo_url, layout_json, is_default, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,true),NOW())
     ON CONFLICT (school_id, template_key) DO UPDATE SET
       title = EXCLUDED.title,
       header_text = EXCLUDED.header_text,
       footer_text = EXCLUDED.footer_text,
       primary_color = EXCLUDED.primary_color,
       logo_url = EXCLUDED.logo_url,
       layout_json = EXCLUDED.layout_json,
       is_default = EXCLUDED.is_default,
       updated_at = NOW()
     RETURNING *`,
    [
      schoolId,
      templateKey,
      data.title || templateKey,
      data.header_text,
      data.footer_text,
      data.primary_color || '#059669',
      data.logo_url,
      JSON.stringify(data.layout_json || {}),
      data.is_default,
    ]
  ).catch((err) => {
    if (err.code === '42P01') throw new AppError('PDF templates table not migrated.', 500);
    throw err;
  });

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'pdf_template', entityId: templateKey });
  return result.rows[0];
};

/** Merge school name + template for PDF generators */
export const getTemplateBundle = async (schoolId, templateKey) => {
  const [school, template] = await Promise.all([
    query(`SELECT name, school_address FROM tenancy.schools WHERE id = $1`, [schoolId]),
    getPdfTemplate(schoolId, templateKey),
  ]);
  return {
    school: school.rows[0],
    template: template || {
      template_key: templateKey,
      title: templateKey,
      header_text: school.rows[0]?.name,
      footer_text: 'Official school document',
      primary_color: '#059669',
    },
  };
};

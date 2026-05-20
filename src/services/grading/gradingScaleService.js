import { query, getClient } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import * as engine from './gradeEngine.js';

const bandSelect = `
  gs.id, gs.profile_id, gs.label, gs.letter_grade, gs.min_score, gs.max_score,
  gs.grade_points, gs.sort_order, gs.is_pass, gs.display_label, gs.description
`;

export const getActiveProfile = async (schoolId) => {
  const result = await query(
    `SELECT id, school_id, name, scale_type, version, is_active, boundary_rule, effective_from, effective_to
     FROM operations.grading_scale_profiles
     WHERE school_id = $1 AND is_active = true AND is_deleted = false
     LIMIT 1`,
    [schoolId]
  );
  return result.rows[0] || null;
};

export const loadBandsForProfile = async (schoolId, profileId) => {
  const result = await query(
    `SELECT ${bandSelect}
     FROM operations.grading_scales gs
     WHERE gs.school_id = $1 AND gs.profile_id = $2
     ORDER BY gs.sort_order, gs.min_score DESC`,
    [schoolId, profileId]
  );
  return result.rows;
};

export const getActiveScaleWithBands = async (schoolId) => {
  const profile = await getActiveProfile(schoolId);
  if (!profile) {
    const bands = await query(
      `SELECT ${bandSelect} FROM operations.grading_scales gs
       WHERE gs.school_id = $1 AND gs.exam_id IS NULL AND gs.profile_id IS NULL
       ORDER BY gs.sort_order, gs.min_score DESC`,
      [schoolId]
    );
    return { profile: null, bands: bands.rows };
  }
  const bands = await loadBandsForProfile(schoolId, profile.id);
  return { profile, bands };
};

export const previewGrade = async (schoolId, score, maxScore = 100) => {
  const { profile, bands } = await getActiveScaleWithBands(schoolId);
  return engine.scoreToGrade(Number(score), maxScore, bands, {
    boundaryRule: profile?.boundary_rule || 'inclusive_max',
  });
};

export const createScaleProfile = async (schoolId, data, actorId) => {
  const { name, scale_type = 'percentage', bands, boundary_rule = 'inclusive_max', activate = true } = data;

  const validation = engine.validateBandsContiguous(bands);
  if (!validation.valid) {
    throw new AppError(validation.errors.join(' '), 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const versionRes = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_v
       FROM operations.grading_scale_profiles WHERE school_id = $1`,
      [schoolId]
    );
    const version = versionRes.rows[0].next_v;

    if (activate) {
      await client.query(
        `UPDATE operations.grading_scale_profiles SET is_active = false, updated_at = NOW()
         WHERE school_id = $1 AND is_active = true`,
        [schoolId]
      );
    }

    const profileRes = await client.query(
      `INSERT INTO operations.grading_scale_profiles (
         school_id, name, scale_type, version, is_active, boundary_rule
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [schoolId, name, scale_type, version, !!activate, boundary_rule]
    );
    const profileId = profileRes.rows[0].id;

    for (const band of bands) {
      await client.query(
        `INSERT INTO operations.grading_scales (
           school_id, profile_id, label, letter_grade, min_score, max_score,
           grade_points, sort_order, is_pass, display_label, description
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          schoolId, profileId,
          band.letter_grade || band.label,
          band.letter_grade || band.label,
          band.min_score, band.max_score,
          band.grade_points ?? null,
          band.sort_order ?? 0,
          band.is_pass !== false,
          band.display_label || band.label,
          band.description || null,
        ]
      );
    }

    await client.query('COMMIT');
    return { profile: profileRes.rows[0], bands: await loadBandsForProfile(schoolId, profileId) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const activateProfile = async (schoolId, profileId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT id FROM operations.grading_scale_profiles
       WHERE id = $1 AND school_id = $2 AND is_deleted = false`,
      [profileId, schoolId]
    );
    if (!check.rows[0]) throw new AppError('Grading scale profile not found.', 404, ERROR_CODES.NOT_FOUND);

    await client.query(
      `UPDATE operations.grading_scale_profiles SET is_active = false, updated_at = NOW()
       WHERE school_id = $1`,
      [schoolId]
    );
    const updated = await client.query(
      `UPDATE operations.grading_scale_profiles SET is_active = true, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [profileId]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const listProfiles = async (schoolId) => {
  const result = await query(
    `SELECT id, name, scale_type, version, is_active, effective_from, effective_to, created_at
     FROM operations.grading_scale_profiles
     WHERE school_id = $1 AND is_deleted = false
     ORDER BY version DESC`,
    [schoolId]
  );
  return result.rows;
};

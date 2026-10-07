import { query } from '../../config/db.js';
import AppError from '../../utils/appError.js';
import { canPlatformWrite } from '../../constants/roles.js';

const ensureProviderAccount = async (userId) => {
  const existing = await query(
    `SELECT id, user_id, balance_points, lifetime_earned
     FROM platform.provider_accounts WHERE user_id = $1`,
    [userId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await query(
    `INSERT INTO platform.provider_accounts (user_id)
     VALUES ($1)
     RETURNING id, user_id, balance_points, lifetime_earned`,
    [userId]
  );
  return created.rows[0];
};

export const getProviderBalance = async (userId) => {
  const account = await ensureProviderAccount(userId);
  return {
    balance_points: Number(account.balance_points),
    lifetime_earned: Number(account.lifetime_earned),
  };
};

export const listPointClaims = async ({ userId, roles, status, limit = 50, offset = 0 }) => {
  const isReviewer = canPlatformWrite(roles);
  const params = [];
  let where = '1=1';

  if (!isReviewer) {
    params.push(userId);
    where += ` AND pc.provider_user_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    where += ` AND pc.status = $${params.length}`;
  }

  params.push(limit, offset);
  const res = await query(
    `SELECT pc.*,
            u.email AS provider_email,
            u.first_name AS provider_first_name,
            u.last_name AS provider_last_name,
            rv.email AS reviewer_email
     FROM platform.point_claims pc
     JOIN identity.users u ON u.id = pc.provider_user_id
     LEFT JOIN identity.users rv ON rv.id = pc.reviewed_by
     WHERE ${where}
     ORDER BY pc.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM platform.point_claims pc WHERE ${where}`,
    params.slice(0, -2)
  );

  return {
    items: res.rows.map(mapClaim),
    total: countRes.rows[0]?.total ?? 0,
  };
};

export const createPointClaim = async ({ userId, points, providerNote }) => {
  const pts = Number(points);
  if (!Number.isFinite(pts) || pts <= 0) {
    throw new AppError('Points must be greater than zero.', 400);
  }

  const account = await ensureProviderAccount(userId);
  if (Number(account.balance_points) < pts) {
    throw new AppError('Insufficient point balance for this claim.', 400);
  }

  const amountEtb = Math.round(pts * 10); // 10 ETB per point — adjust via settings later

  const res = await query(
    `INSERT INTO platform.point_claims (provider_user_id, points, amount_etb, provider_note, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [userId, pts, amountEtb, providerNote || null]
  );

  await query(
    `UPDATE platform.provider_accounts
     SET balance_points = balance_points - $2, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, pts]
  );

  return mapClaim(res.rows[0]);
};

export const reviewPointClaim = async ({ claimId, reviewerId, status, reviewNote }) => {
  if (!['approved', 'rejected', 'paid'].includes(status)) {
    throw new AppError('Invalid review status.', 400);
  }

  const claimRes = await query(`SELECT * FROM platform.point_claims WHERE id = $1`, [claimId]);
  const claim = claimRes.rows[0];
  if (!claim) throw new AppError('Claim not found.', 404);
  if (claim.status !== 'pending' && claim.status !== 'approved') {
    throw new AppError('Claim cannot be reviewed in its current state.', 400);
  }

  const res = await query(
    `UPDATE platform.point_claims
     SET status = $2,
         reviewed_by = $3,
         reviewed_at = NOW(),
         review_note = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [claimId, status, reviewerId, reviewNote || null]
  );

  if (status === 'rejected' && claim.status === 'pending') {
    await query(
      `UPDATE platform.provider_accounts
       SET balance_points = balance_points + $2, updated_at = NOW()
       WHERE user_id = $1`,
      [claim.provider_user_id, claim.points]
    );
  }

  return mapClaim(res.rows[0]);
};

export const cancelPointClaim = async ({ claimId, userId }) => {
  const claimRes = await query(`SELECT * FROM platform.point_claims WHERE id = $1`, [claimId]);
  const claim = claimRes.rows[0];
  if (!claim) throw new AppError('Claim not found.', 404);
  if (claim.provider_user_id !== userId) {
    throw new AppError('You can only cancel your own claims.', 403);
  }
  if (claim.status !== 'pending') {
    throw new AppError('Only pending claims can be cancelled.', 400);
  }

  const res = await query(
    `UPDATE platform.point_claims
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [claimId]
  );

  await query(
    `UPDATE platform.provider_accounts
     SET balance_points = balance_points + $2, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, claim.points]
  );

  return mapClaim(res.rows[0]);
};

export const getPlatformProfile = async (userId) => {
  const res = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.school_id,
            array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS roles
     FROM identity.users u
     LEFT JOIN identity.userroles ur ON ur.user_id = u.id
     LEFT JOIN identity.roles r ON r.id = ur.role_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );
  const row = res.rows[0];
  if (!row) throw new AppError('User not found.', 404);

  let balance = null;
  if ((row.roles || []).includes('SUPER_PROVIDER_ADMIN')) {
    balance = await getProviderBalance(userId);
  }

  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    status: row.status,
    roles: row.roles || [],
    points: balance,
  };
};

export const updatePlatformProfile = async (userId, { first_name, last_name, current_password, new_password }) => {
  const userRes = await query(`SELECT * FROM identity.users WHERE id = $1`, [userId]);
  const user = userRes.rows[0];
  if (!user) throw new AppError('User not found.', 404);

  const updates = [];
  const params = [userId];

  if (first_name != null) {
    params.push(first_name);
    updates.push(`first_name = $${params.length}`);
  }
  if (last_name != null) {
    params.push(last_name);
    updates.push(`last_name = $${params.length}`);
  }

  if (new_password) {
    if (!current_password) throw new AppError('Current password is required.', 400);
    const { comparePasswords, hashPassword } = await import('../utils/auth.js');
    if (!(await comparePasswords(current_password, user.password_hash))) {
      throw new AppError('Current password is incorrect.', 400);
    }
    params.push(await hashPassword(new_password));
    updates.push(`password_hash = $${params.length}`);
  }

  if (updates.length === 0) throw new AppError('No changes provided.', 400);

  await query(`UPDATE identity.users SET ${updates.join(', ')} WHERE id = $1`, params);
  return getPlatformProfile(userId);
};

const mapClaim = (row) => ({
  id: row.id,
  provider_user_id: row.provider_user_id,
  provider_email: row.provider_email,
  provider_first_name: row.provider_first_name,
  provider_last_name: row.provider_last_name,
  points: Number(row.points),
  amount_etb: row.amount_etb != null ? Number(row.amount_etb) : null,
  status: row.status,
  note: row.note,
  provider_note: row.provider_note,
  review_note: row.review_note,
  reviewer_email: row.reviewer_email,
  reviewed_by: row.reviewed_by,
  reviewed_at: row.reviewed_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

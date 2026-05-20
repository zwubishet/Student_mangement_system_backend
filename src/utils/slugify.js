/** URL-safe slug from school name. */
export const slugify = (name) => {
  const base = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'school';
};

export const ensureUniqueSlug = async (client, baseSlug, excludeId = null) => {
  let slug = baseSlug.slice(0, 60);
  let n = 0;
  for (;;) {
    const candidate = n === 0 ? slug : `${slug.slice(0, 50)}-${n}`;
    const params = [candidate];
    let sql = `SELECT id FROM tenancy.schools WHERE slug = $1 AND is_deleted = false`;
    if (excludeId) {
      params.push(excludeId);
      sql += ` AND id != $2`;
    }
    const res = await client.query(sql, params);
    if (res.rows.length === 0) return candidate;
    n += 1;
  }
};

/**
 * Resolve allowed browser origins for CORS.
 * Set CORS_ORIGIN on Render to your Vercel URL, e.g. https://my-app.vercel.app
 * Multiple origins: comma-separated. Use * only for quick tests.
 */
export function resolveCorsOptions() {
  const raw = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '').trim();

  if (!raw || raw === 'CORS_ORIGIN' || raw === 'YOUR_VERCEL_URL') {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[CORS] CORS_ORIGIN is missing or still a placeholder. Browser login from Vercel will fail. Set CORS_ORIGIN=https://your-app.vercel.app on Render.'
      );
    }
    return { origin: true };
  }

  if (raw === '*') {
    return { origin: true };
  }

  const allowed = raw.split(',').map((o) => o.trim()).filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      if (allowed.some((a) => a.includes('*.vercel.app') && /\.vercel\.app$/.test(origin))) {
        return callback(null, true);
      }
      console.warn(`[CORS] Blocked origin: ${origin}. Allowed: ${allowed.join(', ')}`);
      callback(null, false);
    },
    credentials: true,
  };
}

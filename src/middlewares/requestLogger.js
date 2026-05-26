/**
 * Structured request logging for production observability.
 * Logs after response finishes so req.tenant is populated on protected routes.
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl === '/health' || req.originalUrl === '/api/v1/meta') return;

    const tenant = req.tenant || req.user || req.platform;
    const entry = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      user_id: tenant?.userId || tenant?.id || null,
      school_id: tenant?.schoolId || null,
      role: tenant?.role || null,
    };
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(entry));
    } else if (process.env.REQUEST_LOG === '1' || res.statusCode >= 400) {
      console.log(`${entry.method} ${entry.path} ${entry.status} ${entry.duration_ms}ms`);
    }
  });
  next();
};

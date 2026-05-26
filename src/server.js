import app from './app.js';
import { config } from './config/index.js';

const port = config.port;

const server = app.listen(port, () => {
  console.log(`SMS API listening on port ${port} (${config.env || 'development'})`);
});

const shutdown = (signal) => {
  console.log(`${signal} received — closing HTTP server`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION', err?.name, err?.message);
  shutdown('unhandledRejection');
});

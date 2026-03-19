import app from './app.js';
import { config } from './config/index.js';

const port = config.port;

const server = app.listen(port, () => {
  console.log(`🚀 SMS SaaS Backend running on port ${port} in ${config.env} mode`);
});

// Handle unhandled rejections (e.g., DB connection issues)
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
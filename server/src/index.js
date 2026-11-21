import mongoose from 'mongoose';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
const config = loadConfig();
await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
const shutdownController = new AbortController();
const server = createApp(config, shutdownController.signal).listen(config.port, '0.0.0.0', () => console.log(`CampusRide listening on port ${config.port}`));
function shutdown() {
  shutdownController.abort();
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);

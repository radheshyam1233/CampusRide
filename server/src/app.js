import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './routes/auth.js';
import { listingRoutes } from './routes/listings.js';
import { photoRoutes } from './routes/photos.js';
import { errorHandler, HttpError } from './lib/errors.js';
export function createApp(config, shutdownSignal) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], upgradeInsecureRequests: config.production ? [] : null } }, crossOriginEmbedderPolicy: false, strictTransportSecurity: config.production ? undefined : false }));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please try again later.' } }));
  app.use('/api', (req,res,next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.get('Origin');
      if ((origin && origin !== config.origin) || req.get('Sec-Fetch-Site') === 'cross-site') return next(new HttpError(403, 'Cross-site requests are not allowed.'));
      // API clients may omit Origin; browser mutations must send it.
      if (config.production && req.get('Sec-Fetch-Site') && !origin) return next(new HttpError(403, 'Missing request origin.'));
    }
    next();
  });
  app.use(express.json({ limit: '64kb' })); app.use(cookieParser());
  app.get('/api/health', (req,res) => { const ready = mongoose.connection.readyState === 1; res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'database-unavailable' }); });
  app.use('/api/auth', authRoutes(config));
  app.use('/api/listings', listingRoutes(config, shutdownSignal));
  app.use('/api/photos', photoRoutes(config));
  app.use('/api', (req,res,next) => next(new HttpError(404,'API route not found.')));
  const dist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*splat}', (req,res,next) => { if (!req.accepts('html')) return next(new HttpError(404,'Not found.')); res.sendFile(path.join(dist,'index.html'), e => { if(e) next(new HttpError(404,'Frontend has not been built. Run npm run build.')); }); });
  app.use(errorHandler);
  return app;
}

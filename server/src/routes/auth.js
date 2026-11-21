import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { User, publicUser } from '../models/User.js';
import { issueSession, clearSession, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../lib/errors.js';
const email = z.email().max(254).transform(s => s.toLowerCase().trim());
const password = z.string().min(10, 'Use at least 10 characters').max(72).refine(s => Buffer.byteLength(s, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes');
export function authRoutes(config) {
  const router = Router();
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many login attempts. Please try again later.' } });
  router.post('/signup', limit, async (req, res) => {
    const data = z.object({ name: z.string().trim().min(2).max(80), email, password }).strict().parse(req.body);
    if (config.domains.length && !config.domains.includes(data.email.split('@')[1])) throw new HttpError(400, 'Use an email from an allowed college domain.');
    const user = await User.create({ name: data.name, email: data.email, passwordHash: await bcrypt.hash(data.password, 12) });
    const csrf = await issueSession(res, user, config);
    res.status(201).json({ user: publicUser(user), csrf });
  });
  router.post('/login', limit, async (req, res) => {
    const data = z.object({ email, password: z.string().min(1).max(200) }).strict().parse(req.body);
    const user = await User.findOne({ email: data.email }).select('+passwordHash');
    // Do a hash comparison even for unknown accounts to reduce timing differences.
    const hash = user?.passwordHash || '$2b$12$4xu1cyHiK5wZagWYRuByYeFJ9ARsPHKd4CvbR89gJsjqgpGzR5u3C';
    const valid = await bcrypt.compare(data.password, hash);
    if (!user || !valid) throw new HttpError(401, 'Invalid email or password.');
    const csrf = await issueSession(res, user, config);
    res.json({ user: publicUser(user), csrf });
  });
  router.get('/me', requireAuth(config), (req, res) => res.json({ user: publicUser(req.user), csrf: req.csrf }));
  router.post('/logout', requireAuth(config), async (req, res) => {
    await req.session.deleteOne(); clearSession(res, config); res.json({ message: 'Logged out.' });
  });
  return router;
}

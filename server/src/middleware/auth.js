import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { HttpError } from '../lib/errors.js';
const lifetime = 7 * 24 * 60 * 60;
export const cookieName = config => config.production ? '__Host-campusride' : 'campusride';
const options = config => ({ httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' });
export async function issueSession(res, user, config) {
  const session = await Session.create({ user: user._id, expiresAt: new Date(Date.now() + lifetime * 1000) });
  const csrf = randomBytes(24).toString('hex');
  const token = jwt.sign({ sid: session.id, csrf }, config.secret, { subject: user.id, algorithm: 'HS256', expiresIn: lifetime, issuer: 'campusride', audience: 'campusride-web' });
  res.cookie(cookieName(config), token, { ...options(config), maxAge: lifetime * 1000 });
  return csrf;
}
export function clearSession(res, config) { res.clearCookie(cookieName(config), options(config)); }
export function requireAuth(config) {
  return async (req, res, next) => {
    try {
      const token = req.cookies[cookieName(config)];
      if (!token) throw new HttpError(401, 'Please log in to continue.');
      let claims;
      try { claims = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer: 'campusride', audience: 'campusride-web' }); }
      catch { throw new HttpError(401, 'Your session has expired. Please log in again.'); }
      const [session, user] = await Promise.all([Session.findOne({ _id: claims.sid, user: claims.sub, expiresAt: { $gt: new Date() } }), User.findById(claims.sub)]);
      if (!session || !user) throw new HttpError(401, 'Please log in again.');
      if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== claims.csrf) throw new HttpError(403, 'Invalid session request. Refresh the page and try again.');
      req.user = user; req.session = session; req.csrf = claims.csrf;
      next();
    } catch (e) { next(e); }
  };
}

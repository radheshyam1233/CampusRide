import 'dotenv/config';
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const secret = env.JWT_SECRET || '';
  if (secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters. See server/.env.example.');
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const origin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
  const url = new URL(origin);
  if (url.origin !== origin || (production && url.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an exact origin (HTTPS in production), without a trailing slash.');
  return { production, secret, mongoUri: env.MONGODB_URI, origin, port: Number(env.PORT || 5000), trustProxy: Number(env.TRUST_PROXY || 0), domains: (env.ALLOWED_EMAIL_DOMAINS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean) };
}

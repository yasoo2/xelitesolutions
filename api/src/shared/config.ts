import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

// Allowed origins loaded from ALLOWED_ORIGINS env var in production.
// Hardcoded IPs removed for security. Add server IPs via ALLOWED_ORIGINS env var.
const allowedOriginsDefault = [
  'https://xelitesolutions.com',
  'https://www.xelitesolutions.com',
  'https://api.xelitesolutions.com',
  'https://ws.xelitesolutions.com',
  'https://browser.xelitesolutions.com',
  ...(isProd ? [] : ['http://localhost:5173', 'http://localhost:5000', 'http://localhost:3000']),
];

const defaultMongoUri = isProd ? 'mongodb://mongo:27017/joe' : 'mongodb://localhost:27017/joe';
const rawMongoUri = process.env.MONGO_URI || '';
const mongoUri = (rawMongoUri && rawMongoUri.trim()) ? rawMongoUri.trim() : defaultMongoUri;

console.info(`[Config] NODE_ENV: ${process.env.NODE_ENV}`);
console.info(`[Config] MONGO_URI (Source): ${rawMongoUri ? 'ENV' : 'DEFAULT'}`);
console.info(`[Config] Resolved MONGO_URI: ${mongoUri.replace(/:([^@/]+)@/, ':****@')}`); // Redact password if present

if (/^mongodb\+srv:\/\//i.test(mongoUri)) {
  throw new Error('Mongo Atlas (mongodb+srv) is disabled for this deployment. Use MongoDB Docker (mongodb://...).');
}

const jwtSecret = (() => {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim()) return envSecret;
  console.error('CRITICAL: JWT_SECRET is not set! Refusing to start without a valid secret. Set JWT_SECRET in .env.');
  throw new Error('JWT_SECRET must be set');
})();

// Canonical id for the single local user in auth-bypass (local single-user) mode.
// Every subsystem that answers "who is the local user?" MUST converge on this exact
// value. Otherwise Google OAuth tokens saved under one id are read under another
// (google_token_unavailable), and the browser extension registers its socket under
// one id while Joe's panel queries another ("not connected" despite a live socket).
// Honors DEFAULT_USER_ID when set; the default matches the HTTP auth-bypass sub.
const localUserId = (process.env.DEFAULT_USER_ID && process.env.DEFAULT_USER_ID.trim()) || '000000000000000000000001';

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri,
  jwtSecret,
  localUserId,
  allowedOrigins: (process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || allowedOriginsDefault),
};

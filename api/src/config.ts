import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const allowedOriginsDefault = [
  'https://xelitesolutions.com',
  'https://www.xelitesolutions.com',
  'https://api.xelitesolutions.com',
  'https://ws.xelitesolutions.com',
  'https://browser.xelitesolutions.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://46.224.187.142',
  'http://46.224.187.142:5173',
  'http://46.224.187.142:3000',
];

const defaultMongoUri = isProd ? 'mongodb://mongo:27017/joe' : 'mongodb://localhost:27017/joe';
const mongoUri = (process.env.MONGO_URI && process.env.MONGO_URI.trim()) ? process.env.MONGO_URI.trim() : defaultMongoUri;
if (/^mongodb\+srv:\/\//i.test(mongoUri)) {
  throw new Error('Mongo Atlas (mongodb+srv) is disabled for this deployment. Use MongoDB Docker (mongodb://...).');
}

const jwtSecret = (() => {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim()) return envSecret;
  if (isProd) {
    console.error(
      'JWT_SECRET is not set. Generating ephemeral secret. Tokens will reset on restart. Set JWT_SECRET in .env for stable production.',
    );
  } else {
    console.warn('WARN: Using insecure generated JWT secret. Set JWT_SECRET in .env for production.');
  }
  return require('crypto').randomBytes(32).toString('hex');
})();

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri,
  jwtSecret,
  allowedOrigins: (process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || allowedOriginsDefault),
};

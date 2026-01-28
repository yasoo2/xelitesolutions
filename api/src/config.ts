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

const jwtSecret = process.env.JWT_SECRET || (() => {
  if (isProd) {
    throw new Error('JWT_SECRET is required in production');
  }
  console.warn('WARN: Using insecure generated JWT secret. Set JWT_SECRET in .env for production.');
  return require('crypto').randomBytes(32).toString('hex');
})();

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/joe',
  jwtSecret,
  allowedOrigins: (process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || allowedOriginsDefault),
};

import dotenv from 'dotenv';

dotenv.config();

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

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/joe',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  allowedOrigins: (process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || allowedOriginsDefault),
};

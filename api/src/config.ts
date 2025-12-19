import dotenv from 'dotenv';

dotenv.config();

const allowedOriginsDefault = [
  'https://xelitesolutions.com',
  'https://www.xelitesolutions.com',
  'https://infinity-x-platform.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

export const config = {
  port: Number(process.env.PORT) || 8080,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/joe',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  allowedOrigins: (process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || allowedOriginsDefault),
  browserWorkerUrl: process.env.BROWSER_WORKER_URL || 'http://localhost:7070',
  browserWorkerKey: process.env.BROWSER_WORKER_KEY || 'change-me',
};

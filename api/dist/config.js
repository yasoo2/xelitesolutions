"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const allowedOriginsDefault = [
    'https://xelitesolutions.com',
    'https://www.xelitesolutions.com',
    'http://localhost:5173',
    'http://localhost:3000',
];
exports.config = {
    port: Number(process.env.PORT) || 8080,
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/joe',
    jwtSecret: process.env.JWT_SECRET || 'change-me',
    allowedOrigins: (process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || allowedOriginsDefault),
};

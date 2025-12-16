"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = header.slice('Bearer '.length);
    try {
        const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        req.auth = payload;
        return next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

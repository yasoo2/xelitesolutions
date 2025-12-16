"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = require("../models/user");
const config_1 = require("../config");
const mongoose_1 = __importDefault(require("mongoose"));
const db_1 = require("../mock/db");
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    const { email, password, role } = req.body || {};
    if (!email || !password)
        return res.status(400).json({ error: 'Missing email/password' });
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    if (useMock) {
        const exists = db_1.mockDb.findUserByEmail(email);
        if (exists)
            return res.status(409).json({ error: 'Email already exists' });
        const user = db_1.mockDb.createUser(email, passwordHash, role || 'USER');
        return res.status(201).json({ id: user.id, email: user.email, role: user.role });
    }
    else {
        const exists = await user_1.User.findOne({ email }).lean();
        if (exists)
            return res.status(409).json({ error: 'Email already exists' });
        const user = await user_1.User.create({ email, passwordHash, role: role || 'USER' });
        return res.status(201).json({ id: user._id, email: user.email, role: user.role });
    }
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password)
        return res.status(400).json({ error: 'Missing email/password' });
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    if (useMock) {
        const user = db_1.mockDb.findUserByEmail(email);
        if (!user)
            return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!ok)
            return res.status(401).json({ error: 'Invalid credentials' });
        const token = jsonwebtoken_1.default.sign({ sub: user.id.toString(), role: user.role }, config_1.config.jwtSecret, { expiresIn: '7d' });
        return res.json({ token });
    }
    else {
        const user = await user_1.User.findOne({ email });
        if (!user)
            return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!ok)
            return res.status(401).json({ error: 'Invalid credentials' });
        const token = jsonwebtoken_1.default.sign({ sub: user._id.toString(), role: user.role }, config_1.config.jwtSecret, { expiresIn: '7d' });
        return res.json({ token });
    }
});
exports.default = router;

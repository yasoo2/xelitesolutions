"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const session_1 = require("../models/session");
const message_1 = require("../models/message");
const store_1 = require("../mock/store");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, async (_req, res) => {
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    if (useMock) {
        return res.json({ sessions: store_1.store.listSessions() });
    }
    const sessions = await session_1.Session.find().lean();
    return res.json({ sessions });
});
router.post('/', auth_1.authenticate, async (req, res) => {
    const { title, mode } = req.body || {};
    if (!title)
        return res.status(400).json({ error: 'Missing title' });
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    if (useMock) {
        const s = store_1.store.createSession(title, mode || 'ADVISOR');
        return res.status(201).json(s);
    }
    const userId = req.auth?.sub;
    const s = await session_1.Session.create({ title, mode: mode || 'ADVISOR', userId });
    return res.status(201).json({ id: s._id.toString(), title: s.title, mode: s.mode });
});
router.get('/:id/messages', auth_1.authenticate, async (req, res) => {
    const sessionId = String(req.params.id);
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    if (useMock) {
        return res.json({ messages: store_1.store.listMessages(sessionId) });
    }
    const messages = await message_1.Message.find({ sessionId }).lean();
    return res.json({ messages });
});
router.post('/:id/messages', auth_1.authenticate, async (req, res) => {
    const sessionId = String(req.params.id);
    const { role, content } = req.body || {};
    if (!role || !content)
        return res.status(400).json({ error: 'Missing role/content' });
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    if (useMock) {
        const m = store_1.store.addMessage(sessionId, role, content);
        return res.status(201).json(m);
    }
    const m = await message_1.Message.create({ sessionId, role, content });
    return res.status(201).json({ id: m._id.toString(), sessionId, role, content });
});
exports.default = router;

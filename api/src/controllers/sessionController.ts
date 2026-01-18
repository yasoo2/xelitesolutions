import { Request, Response } from 'express';
import { Session } from '../models/session';
import { Tenant } from '../models/tenant';
import { store } from '../mock/store';
import mongoose from 'mongoose';

const useMock = () => process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

export async function createSession(req: Request, res: Response) {
    const rawTitle = typeof req.body?.title === 'string' ? req.body.title : '';
    const title = rawTitle && rawTitle.trim() ? rawTitle.trim() : 'New Session';
    const kind: 'chat' | 'agent' = (typeof req.body?.kind === 'string' && req.body.kind === 'agent') ? 'agent' : 'chat';
    const mode: 'ADVISOR' | 'BUILDER' | 'SAFE' | 'OWNER' = 'ADVISOR';
    const userId = (req as any).auth?.sub;

    try {
        if (useMock()) {
            const session = store.createSession(title, mode, kind);
            return res.json(session);
        }

        const tenantName = process.env.DEFAULT_TENANT_NAME || 'XElite Solutions';
        const tenantDoc = await Tenant.findOneAndUpdate(
            { name: tenantName },
            { $setOnInsert: { name: tenantName } },
            { upsert: true, new: true }
        );

        try {
            const session = await Session.create({ title, mode, kind, userId, tenantId: tenantDoc._id });
            return res.json(session);
        } catch (err: any) {
            if (err && err.code === 11000) {
                const uniqueTitle = `${title} - ${new Date().toLocaleString()}`;
                const session = await Session.create({ title: uniqueTitle, mode, kind, userId, tenantId: tenantDoc._id });
                return res.json(session);
            }
            throw err;
        }
    } catch (e) {
        console.error('Create Session Error:', e);
        return res.status(500).json({ error: 'Failed to create session' });
    }
}

export async function listSessions(req: Request, res: Response) {
    const userId = (req as any).auth?.sub;
    try {
        if (useMock()) {
            // Basic mock listing not fully implemented in snippet but standard store usage
            return res.json(store.getSessions()); // Assuming store has this
        }
        const sessions = await Session.find({ userId }).sort({ updatedAt: -1 }).limit(100);
        return res.json(sessions);
    } catch (e) {
        return res.status(500).json({ error: 'Failed to list sessions' });
    }
}

export async function deleteSession(req: Request, res: Response) {
    const id = req.params.id;
    try {
        if (useMock()) {
            store.deleteSession(id);
            return res.json({ ok: true });
        }
        await Session.findByIdAndDelete(id);
        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to delete session' });
    }
}

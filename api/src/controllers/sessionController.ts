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
            return res.json(store.listSessions()); // Assuming store has this
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

export async function deleteAllSessions(req: Request, res: Response) {
    const userId = (req as any).auth?.sub;
    try {
        if (useMock()) {
            // Mock implementation (stub)
            return res.json({ ok: true });
        }
        const result = await Session.deleteMany({ userId });
        return res.json({ ok: true, count: result.deletedCount });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to delete all sessions' });
    }
}

export async function togglePin(req: Request, res: Response) {
    const id = req.params.id;
    try {
        if (!useMock()) {
            const s = await Session.findById(id);
            if (s) {
                s.isPinned = !s.isPinned;
                await s.save();
                return res.json(s);
            }
        }
        return res.status(404).json({ error: 'Session not found' });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to toggle pin' });
    }
}

export async function moveSession(req: Request, res: Response) {
    const id = req.params.id;
    const folderId = req.body.folderId;
    try {
        if (!useMock()) {
            const s = await Session.findByIdAndUpdate(id, { folderId }, { new: true });
            return res.json(s);
        }
        return res.json({ id, folderId, moved: true });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to move session' });
    }
}

export async function updateSecrets(req: Request, res: Response) {
    const id = req.params.id;
    // Just a stub for now to prevent crash
    return res.json({ ok: true, message: 'Secrets updated (stub)' });
}

// ... (existing imports)
import { Message } from '../models/message';
import { ToolExecution } from '../models/toolExecution';
import { generateSessionTitle } from '../llm';
import { broadcast } from '../ws';

export async function listSessionMessages(req: Request, res: Response) {
    const sessionId = req.params.id;
    const userId = (req as any).auth?.sub;

    try {
        if (useMock()) {
            return res.json(store.listMessages(sessionId));
        }

        // Fetch Messages, Tools, and Session in parallel
        const [messages, tools, session] = await Promise.all([
            Message.find({ sessionId }).sort({ createdAt: 1 }).lean(),
            ToolExecution.find({ sessionId: sessionId }).sort({ createdAt: 1 }).lean(),
            Session.findById(sessionId)
        ]);

        // Transform to unified events format for frontend
        const events: any[] = [];

        messages.forEach((m: any) => {
            if (m.role === 'user') {
                events.push({
                    type: 'user_input',
                    data: m.content,
                    ts: new Date(m.createdAt).getTime(),
                    id: m._id.toString(),
                    seq: 0
                });
            } else if (m.role === 'assistant') {
                events.push({
                    type: 'text',
                    data: { text: m.content },
                    ts: new Date(m.createdAt).getTime(),
                    id: m._id.toString(),
                    runId: m.runId
                });
            }
        });

        tools.forEach((t: any) => {
            const ts = new Date(t.createdAt).getTime();
            events.push({
                type: 'step_started',
                runId: t.runId,
                data: { name: `execute:${t.name}`, input: t.input },
                ts: ts
            });
            events.push({
                type: t.ok ? 'step_done' : 'step_failed',
                runId: t.runId,
                data: {
                    name: `execute:${t.name}`,
                    result: {
                        ok: t.ok,
                        output: t.output,
                        error: t.ok ? undefined : (t.output || 'Failed')
                    }
                },
                ts: ts + 10
            });
        });

        events.sort((a, b) => (a.ts || 0) - (b.ts || 0));

        // Auto-Title Check (Lazy)
        if (session && (session.title === 'New Session' || session.title.startsWith('Session '))) {
            const userMsgs = messages.filter(m => m.role === 'user');
            if (userMsgs.length > 0 && userMsgs.length <= 5) {
                (async () => {
                    try {
                        const newTitle = await generateSessionTitle(userMsgs.map(m => ({ role: 'user', content: m.content || '' })));
                        if (newTitle && newTitle !== 'New Session') {
                            await Session.findByIdAndUpdate(sessionId, { title: newTitle });
                            broadcast({ type: 'sessions:refresh', data: { sessionId } });
                        }
                    } catch (e) { console.error('Lazy auto-title failed', e) }
                })();
            }
        }

        return res.json({ events });
    } catch (e) {
        console.error('List Messages Error', e);
        return res.status(500).json({ error: 'Failed to list session messages' });
    }
}

export async function searchSessions(req: Request, res: Response) {
    // ... (existing searchSessions code)
    const userId = (req as any).auth?.sub;
    const query = String(req.query.q || '').trim();
    const kind = String(req.query.kind || '');
    if (!query) return res.json([]);

    try {
        if (useMock()) {
            const all = store.listSessions();
            const filtered = all.filter((s: any) =>
                (s.title || '').toLowerCase().includes(query.toLowerCase()) &&
                (!kind || s.kind === kind)
            );
            return res.json(filtered);
        }

        const filter: any = {
            userId,
            title: { $regex: query, $options: 'i' }
        };
        if (kind) {
            filter.kind = kind;
        }
        const sessions = await Session.find(filter).sort({ updatedAt: -1 }).limit(20);
        return res.json(sessions);
    } catch (e) {
        return res.status(500).json({ error: 'Failed to search sessions' });
    }
}

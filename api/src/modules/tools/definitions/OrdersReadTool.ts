/**
 * «اعرض الطلبات» — the owner reads visitor orders IN THE CHAT.
 *
 * The orders live in the API project's own database. This reads them
 * STRAIGHT FROM DISK (node:sqlite read-only, or the JSON store — the same
 * dual contract the scaffolded db.js keeps), so it works whether the API
 * server is running or not, and never depends on a port being up.
 *
 * The session's API is found the way the rest of the chain remembers it:
 * the active project when it IS the API, or the linkedApiDir the react
 * build carried along when it took the session's project slot.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';

export interface OrderRow {
    id: number; item: string; qty: number; customer: string; phone: string; note: string; created_at: string;
}

/** Latest-first orders from the API dir's database, or null when there is no database yet. */
export function readOrders(apiDir: string): OrderRow[] | null {
    const dbPath = path.join(apiDir, 'data.db');
    if (fs.existsSync(dbPath)) {
        try {
            const { DatabaseSync } = require('node:sqlite');
            let conn: any;
            try { conn = new DatabaseSync(dbPath, { readOnly: true }); }
            catch { conn = new DatabaseSync(dbPath); }
            const rows = conn.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all()
                .map((o: any) => ({ id: o.id, item: o.item, qty: o.qty, customer: o.customer, phone: o.phone, note: o.note, created_at: o.created_at }));
            try { conn.close(); } catch { /* older runtime */ }
            return rows;
        } catch { /* fall through to the JSON twin */ }
    }
    const jsonPath = path.join(apiDir, 'data.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const s = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            return (Array.isArray(s.orders) ? s.orders : []).slice().reverse().slice(0, 200);
        } catch { return null; }
    }
    return null;
}

export class OrdersReadTool extends BaseTool {
    name = 'orders_read';
    description = 'Read visitor orders from the session\'s API database (disk-direct, works with the server stopped) and list them in the chat.';
    version = '1.0.0';
    tags = ['orders', 'api', 'read', 'database'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'The user\'s ask, e.g. «اعرض الطلبات»' },
        },
        required: [],
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 20;
    auditFields = ['request'];

    async execute(_input: any, context?: any): Promise<ToolExecutionResult> {
        const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const entry = ((global as any).joeProjects || {})[sessionKey];
        const apiDir = entry?.type === 'api' ? entry.dir : entry?.linkedApiDir;
        if (!apiDir || !fs.existsSync(String(apiDir))) {
            return {
                ok: true,
                output: { message: 'لا يوجد مشروع API في هذه الجلسة — ابنِ واحداً أولاً: «ابنِ لي API لمنتجات متجري»، ثم اربط واجهتك به.' },
                logs: [],
            } as any;
        }
        const orders = readOrders(String(apiDir));
        if (orders === null) {
            return {
                ok: true,
                output: { message: '🗄️ قاعدة البيانات لم تُنشأ بعد — شغّل الـ API مرة واحدة («شغّل المشروع» أو npm start داخل مجلده) وسيبذر نفسه.' },
                logs: [],
            } as any;
        }
        if (!orders.length) {
            return { ok: true, output: { message: '📭 لا توجد طلبات بعد — حين يضغط زائر «اطلب الآن» في موقعك سيظهر طلبه هنا فوراً.', orders: [] }, logs: [] } as any;
        }
        const shown = orders.slice(0, 10);
        const lines = shown.map(o =>
            `   • #${o.id} — ${o.item} ×${o.qty} — ${o.customer}${o.phone ? ` (${o.phone})` : ''}${o.note ? ` — ${o.note}` : ''}`).join('\n');
        const message = `🧾 طلبات زوار موقعك — ${orders.length} طلب${orders.length > 10 ? ` (أحدث 10)` : ''}:
${lines}

🗄️ المصدر: قاعدة بيانات مشروعك مباشرة (${fs.existsSync(path.join(String(apiDir), 'data.db')) ? 'SQLite' : 'JSON'}) — تعمل حتى والخادم متوقف.`;
        return { ok: true, output: { message, orders: shown, total: orders.length }, logs: [] } as any;
    }
}

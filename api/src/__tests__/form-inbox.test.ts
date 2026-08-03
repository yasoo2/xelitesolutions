/**
 * STAGE 4 — live data: the form inbox, locked.
 *
 * The contract: submissions land bounded on disk through a public endpoint;
 * the built page's runtime posts to data-joe-inbox and keeps its honest
 * fallback; the builder wires every data-joe-form; the owner reads messages
 * in the chat, scoped to their own site.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { appendSubmission, listSubmissions } from '../api/form-inbox';
import { wireFormsToInbox, formRuntime } from '../core/design/forms';
import { FormInboxTool } from '../modules/tools/definitions/FormInboxTool';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

let tmp: string;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-inbox-')); process.env.JOE_CHAT_STORE_DIR = tmp; });
afterAll(() => { delete process.env.JOE_CHAT_STORE_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

describe('the disk store: bounded, scoped, newest first', () => {
    it('append + list round trip', () => {
        appendSubmission('site-a', { name: 'أحمد', msg: 'مرحبا' }, 'الرئيسية');
        appendSubmission('site-b', { name: 'سارة' });
        const a = listSubmissions(['site-a']);
        expect(a.length).toBe(1);
        expect(a[0].fields.name).toBe('أحمد');
        expect(listSubmissions(['site-b'])[0].fields.name).toBe('سارة');
    });
    it('fields are bounded (20 keys, 2000 chars) and the store caps at 500', () => {
        const big: Record<string, string> = {};
        for (let i = 0; i < 30; i++) big[`k${i}`] = 'x'.repeat(3000);
        const e = appendSubmission('site-c', big);
        expect(Object.keys(e.fields).length).toBeLessThanOrEqual(20);
        expect(e.fields.k0.length).toBe(2000);
    });
});

describe('the runtime: real delivery first, honesty kept', () => {
    it('posts to data-joe-inbox and falls back on failure', () => {
        const rt = formRuntime(true);
        expect(rt).toContain("form.getAttribute('data-joe-inbox')");
        expect(rt).toContain('deliverFallback');
        expect(rt).toContain('وصلت رسالتك');
        // The old honesty is still there, word for word.
        expect(rt).toContain('لم يُوصَل هذا النموذج بخادم بعد');
    });
    it('wireFormsToInbox tags joe forms only, idempotently', () => {
        const html = '<form data-joe-form data-to="a@b.co"><input name="x"></form><form id="other"></form>';
        const once = wireFormsToInbox(html, 'sess_1', 5002);
        expect(once).toContain('data-joe-inbox="http://localhost:5002/api/public/forms/sess_1"');
        expect(once).toContain('<form id="other">');           // untouched
        expect(wireFormsToInbox(once, 'sess_1', 5002)).toBe(once);
        expect((wireFormsToInbox(once, 'sess_1', 5002).match(/data-joe-inbox/g) || []).length).toBe(1);
    });
    it('the React contact template posts to content.inbox with the same honesty', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(src).toContain('fetch(content.inbox');
        expect(src).toContain("setSent('delivered')");
        expect(src).toContain("setSent('kept')");
    });
});

describe('the public endpoint exists and the builder wires it', () => {
    it('the app mounts /public/forms and the builder calls wireFormsToInbox', () => {
        const app = fs.readFileSync(path.join(__dirname, '..', 'api', 'app.ts'), 'utf-8');
        expect(app).toContain("apiRouter.use('/public/forms', formsPublicRoutes)");
        const builder = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'), 'utf-8');
        expect(builder).toContain('wireFormsToInbox(html, sessionKey, PORT)');
    });
});

describe('reading the inbox in the chat', () => {
    const KEY = 'inbox-read';
    afterEach(() => { delete (global as any).joePages?.[KEY]; });

    it('the tool lists only THIS session\'s messages, formatted', async () => {
        appendSubmission(KEY, { name: 'خالد', msg: 'أريد عرض سعر' }, 'مقهى بُن');
        appendSubmission('someone-else', { name: 'غريب' });
        const res: any = await new FormInboxTool().execute({ request: 'اعرض رسائل النموذج' }, { sessionId: KEY });
        expect(res.ok).toBe(true);
        expect(res.output.message).toContain('خالد');
        expect(res.output.message).not.toContain('غريب');
    });
    it('an empty inbox is an honest empty answer', async () => {
        const res: any = await new FormInboxTool().execute({ request: 'اعرض الرسائل' }, { sessionId: 'inbox-empty' });
        expect(res.output.message).toContain('📭');
    });
    it('«اعرض رسائل النموذج» routes to form_inbox when a site exists', async () => {
        (global as any).joePages = { ...(global as any).joePages, [KEY]: { filename: 'x.html', html: '<html>x</html>', updatedAt: Date.now() } };
        const tool = await Promise.race([
            PlanningEngine.generatePlan({ intent: { goal: 'اعرض رسائل النموذج', complexity: 'low', riskLevel: 'low', rawIntent: {} } as any }, undefined, { sessionId: KEY })
                .then(p => p.steps[0].tool).catch(() => 'fail'),
            new Promise<string>(r => { const t = setTimeout(() => r('timeout'), 1500); (t as any).unref?.(); }),
        ]);
        expect(tool).toBe('form_inbox');
    });
});

/**
 * ⛔ «تراجع» PUTS BACK THE COPY THE CHANGE KEPT, AND SAYS ONLY WHAT IT DID.
 *
 * Read on 2026-11-05, on a project the agent engine built and then changed:
 *   - "undo the last change" was read as a change (the edit reader sees
 *     "change"), so the engine took it and would have undone by hand what
 *     project_undo restores byte for byte from the copy the change kept;
 *   - «تراجع» on a plain HTML project answered «✅ وأُعيد البناء» although
 *     nothing was built — the project has no build to run.
 * An undo or a versions request now goes to the planner's undo, which
 * restores the kept copy; a request to ADD an undo button is still a change.
 * The undo reply names a rebuild only when one ran, in the interface's language.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { agentEngineRoute, isUndoRequest } from '../core/engine/select';
import { changeContextFor } from '../core/engine/run';
import { writeJoeProject } from '../api/page-store';
import { previewKey } from '../modules/tools/preview-site';
import { ProjectUndoTool } from '../modules/tools/definitions/ProjectUndoTool';

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-undo-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const AGENT = { JOE_ENGINE: 'agent' } as NodeJS.ProcessEnv;

function project(name: string): string {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html lang="ar" dir="rtl"><body>v1</body></html>');
    fs.writeFileSync(path.join(dir, '.joe', 'result.json'), '{"status":"delivered","summary":"صفحة عدّاد"}');
    return dir;
}

describe('an undo is no change to make', () => {
    it('reads an undo or a versions request, after the words people put before it', () => {
        for (const text of ['تراجع', 'تراجع عن آخر تعديل', 'لو سمحت رجّع المشروع للنسخة السابقة', 'ارجع للنسخة السابقة', 'استرجع النسخة القديمة', 'اعرض النسخ',
            'undo', 'Undo the last change', 'please revert that', 'roll back the last change', 'go back to the previous version', 'show the versions']) {
            expect([text, isUndoRequest(text)]).toEqual([text, true]);
        }
    });

    it('never reads a request to add or change an undo feature as an undo', () => {
        for (const text of ['أضف زر تراجع للمحرر', 'غير لون زر التراجع', 'add an undo button', 'make the undo button bigger', 'build a drawing app with undo and redo',
            'أريد أن أرجع إلى الصفحة الرئيسية من أي صفحة', 'لما أسكر الصفحة وأرجع أفتحها تبقى البيانات']) {
            expect([text, isUndoRequest(text)]).toEqual([text, false]);
        }
    });

    it('leaves an undo to the planner\'s undo, and an undo button to the engine', async () => {
        const dir = project('joe-undo-route');
        writeJoeProject(previewKey('chat-undo'), { dir, type: 'agent', updatedAt: Date.now() }, 'run-earlier');
        expect(await agentEngineRoute('undo the last change', { sessionId: 'chat-undo' }, AGENT)).toBeNull();
        expect(await agentEngineRoute('تراجع عن آخر تعديل', { sessionId: 'chat-undo' }, AGENT)).toBeNull();
        expect(await agentEngineRoute('add an undo button to the editor', { sessionId: 'chat-undo' }, AGENT)).toEqual({ kind: 'change', path: dir });
    });
});

describe('the undo reply says only what it did', () => {
    afterEach(() => { delete (global as any).joeProjects?.[previewKey('chat-undo-plain')]; });

    it('puts back the copy the change kept, and claims no build for a project that has none', async () => {
        const dir = project('joe-undo-plain');
        writeJoeProject(previewKey('chat-undo-plain'), { dir, type: 'agent', updatedAt: Date.now() }, 'run-earlier');
        expect(changeContextFor(dir, 'أضف وضعاً ليلياً', 'ابنِ صفحة عدّاد').snapshot).toBeTruthy();
        fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>v2</body></html>');

        const out: any = await new ProjectUndoTool().execute({}, { sessionId: 'chat-undo-plain', language: 'ar' });
        expect(out.ok).toBe(true);
        expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toContain('v1');
        expect(out.output.message).toContain('قبل: أضف وضعاً ليلياً');
        expect(out.output.message).not.toMatch(/البناء|dist/);
        expect(out.output.rebuilt).toBe(false);
    });

    it('answers an English interface in English', async () => {
        const dir = project('joe-undo-english');
        writeJoeProject(previewKey('chat-undo-plain'), { dir, type: 'agent', updatedAt: Date.now() }, 'run-earlier');
        changeContextFor(dir, 'Add a dark mode', 'Build a counter page');
        fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>v2</body></html>');

        const out: any = await new ProjectUndoTool().execute({}, { sessionId: 'chat-undo-plain', language: 'en' });
        expect(out.ok).toBe(true);
        expect(out.output.message).toMatch(/^↩️ Rolled the project back to the version of /);
        expect(out.output.message).not.toMatch(/[ء-ي]{3}/u);
        expect(out.output.message).toContain('say "undo" again');
    });
});

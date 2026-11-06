/**
 * ⛔ A CHANGE KNOWS THE PROJECT IT CHANGES, AND CAN BE TAKEN BACK.
 *
 * Read on 2026-11-05, before the hard exam's second half: the agent engine
 * takes a follow-up in the chat's own folder, but
 *   - «أضف وضعاً ليلياً» names no target the edit reader knows, so in an
 *     Arabic chat it was a new build, in a new folder, from nothing;
 *   - a change run was told nothing: not that the folder holds a delivered
 *     project, not what it was built for, not what the last run delivered —
 *     the model met a full folder with only the new sentence;
 *   - nothing was kept before it wrote: `snapshotProject` wanted a
 *     package.json, so a plain HTML/JS project had no version at all, and
 *     «تراجع» answered «no_versions» after the engine had rewritten it.
 * A change now names itself to the model with the project's own history,
 * the project is kept before the change touches it, and the run's own
 * records (`.joe`) are never part of what is kept or put back.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { agentEngineRoute, isFollowUpChange } from '../core/engine/select';
import { firstMessage } from '../core/engine/prompt';
import { changeContextFor, projectHistory, recordRunHistory } from '../core/engine/run';
import { listVersions, restoreVersion, snapshotProject } from '../core/project/versions';
import { newPlan } from '../core/engine/plan';
import { writeJoeProject } from '../api/page-store';
import { previewKey } from '../modules/tools/preview-site';

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-change-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const AGENT = { JOE_ENGINE: 'agent' } as NodeJS.ProcessEnv;

function project(name: string, files: Record<string, string> = {}): string {
    const dir = path.join(root, name);
    const all = { 'index.html': '<html lang="ar" dir="rtl"><body>v1</body></html>', 'app.js': 'console.log(1);', '.joe/result.json': '{"status":"delivered","summary":"قائمة مهام تعمل"}', ...files };
    for (const [rel, body] of Object.entries(all)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), body);
    }
    return dir;
}

describe('a follow-up is a change of the chat\'s project', () => {
    it('reads an Arabic or English follow-up that leads with a change as a change', () => {
        for (const text of ['أضف وضعاً ليلياً للتطبيق', 'خلي الخلفية زرقاء والخط أكبر', 'اجعل العنوان في المنتصف', 'غيّر اسم التطبيق إلى «مهامي»', 'وكمان احذف قسم الأسئلة',
            'اجعل الموقع أسرع', 'خلي لون موقعك أزرق',
            'Add a dark mode', 'make the header sticky', 'now remove the footer', 'Please translate the page to English', 'make the app faster']) {
            expect([text, isFollowUpChange(text)]).toEqual([text, true]);
        }
    });

    it('never reads a new build, a question or a fresh start as a change', () => {
        for (const text of ['ابني تطبيق مصاريف للعائلة', 'اعمل لي موقع جديد لمطعم', 'Build a new chess game', 'ما الفرق بين localStorage و sessionStorage؟',
            'أضف مشروعاً جديداً من الصفر: متجر ورد', 'start over and build a store from scratch', 'Add',
            'اجعل لي موقعاً لمطعم', 'خلي لنا تطبيق حجوزات', 'make me a booking app', 'Make a simple todo app with dark mode']) {
            expect([text, isFollowUpChange(text)]).toEqual([text, false]);
        }
    });

    it('routes «أضف وضعاً ليلياً» into the chat\'s own project', async () => {
        const dir = project('joe-app-night');
        writeJoeProject(previewKey('chat-night'), { dir, type: 'agent', updatedAt: Date.now() }, 'run-earlier');
        expect(await agentEngineRoute('أضف وضعاً ليلياً للتطبيق', { sessionId: 'chat-night' }, AGENT)).toEqual({ kind: 'change', path: dir });
        expect(await agentEngineRoute('ابني تطبيق مصاريف للعائلة', { sessionId: 'chat-night' }, AGENT)).toEqual({ kind: 'build' });
    });
});

describe('the project is kept before a change touches it', () => {
    it('keeps a plain HTML project, without the run\'s own records, and puts it back', () => {
        const dir = project('joe-app-plain');
        const kept = snapshotProject(dir, 'قبل: أضف وضعاً ليلياً');
        expect(kept).not.toBeNull();
        expect(kept!.files).toBe(2);
        fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>v2</body></html>');
        fs.writeFileSync(path.join(dir, 'night.css'), 'body{background:#000}');
        fs.writeFileSync(path.join(dir, '.joe', 'result.json'), '{"status":"delivered","summary":"v2"}');
        const back = restoreVersion(dir, kept!.id);
        expect(back.ok).toBe(true);
        expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toContain('v1');
        expect(fs.existsSync(path.join(dir, 'night.css'))).toBe(false);
        expect(fs.readFileSync(path.join(dir, '.joe', 'result.json'), 'utf8')).toContain('v2');
    });

    it('still keeps nothing of a folder that is no project', () => {
        const dir = path.join(root, 'just-notes');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
        expect(snapshotProject(dir, 'x')).toBeNull();
    });
});

describe('a change run is told what it changes', () => {
    it('keeps each run\'s request and outcome in the project\'s history, newest last', () => {
        const dir = project('joe-app-history');
        recordRunHistory(dir, { request: 'اعمل تطبيق مهام', status: 'delivered', summary: 'قائمة مهام تعمل' });
        recordRunHistory(dir, { request: 'أضف زر حذف المنجزة', status: 'delivered', summary: 'أضيف الزر' });
        expect(projectHistory(dir).map(h => h.request)).toEqual(['اعمل تطبيق مهام', 'أضف زر حذف المنجزة']);
    });

    it('reads the last run of a project that has no history yet from its result and its registered request', () => {
        const dir = project('joe-app-legacy');
        expect(projectHistory(dir, 'اعمل تطبيق مهام')).toEqual([{ request: 'اعمل تطبيق مهام', status: 'delivered', summary: 'قائمة مهام تعمل' }]);
    });

    it('keeps the project and names the kept version in the change\'s context', () => {
        const dir = project('joe-app-context');
        recordRunHistory(dir, { request: 'اعمل تطبيق مهام', status: 'delivered', summary: 'قائمة مهام تعمل' });
        const change = changeContextFor(dir, 'أضف وضعاً ليلياً');
        expect(change.history.map(h => h.request)).toEqual(['اعمل تطبيق مهام']);
        expect(change.snapshot).toBe(listVersions(dir)[0].id);
        expect(listVersions(dir)[0].label).toContain('أضف وضعاً ليلياً');
    });

    it('says it is a change, what the project was built for and what it delivered, and that it can be undone', () => {
        const text = firstMessage('أضف وضعاً ليلياً', 'ar', newPlan([]), 'D:/w/app', 'ar', {
            history: [{ request: 'اعمل تطبيق مهام', status: 'delivered', summary: 'قائمة مهام تعمل' }], snapshot: 'v-1',
        });
        expect(text).toMatch(/CHANGE to the project already in this folder/);
        expect(text).toContain('اعمل تطبيق مهام');
        expect(text).toContain('قائمة مهام تعمل');
        expect(text).toMatch(/still work/);
        expect(text).toMatch(/تراجع/);
    });

    it('leaves a new build\'s first message exactly as it was', () => {
        const text = firstMessage('اعمل لي متجر', 'ar', newPlan([]), 'D:/w/app', 'ar');
        expect(text).not.toMatch(/CHANGE/);
        expect(text.split('\n')[0]).toBe('Request (verbatim):');
    });
});

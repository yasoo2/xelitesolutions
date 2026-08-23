/**
 * The code, live, in the Logs panel.
 *
 * «يجب أن تفتح قائمة اللوجز وأن يفتح الملف وأن تتكوّن داخلها الكودات بشكل حي،
 * وعند الانتهاء تفتح شاشة البريفيو تلقائيًا» — none of it existed. The Logs
 * tab showed "Step Started"/"Step Done" strings while the actual HTML was
 * invisible until the finished preview appeared from nowhere.
 *
 * The contract this file pins down:
 *   - a `file_stream` chunk is REAL section HTML broadcast the moment it was
 *     accepted — never re-chunked or trickled for effect, because a fake
 *     typewriter over finished text is exactly the simulation this system
 *     bans;
 *   - a `done` event carries the complete file as written to disk and
 *     REPLACES the accumulated draft (the written file includes Joe's own
 *     chrome, so appending it would double the page);
 *   - a new run starts with a clean slate.
 */

import fs from 'fs';
import path from 'path';

const BUILDER = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'), 'utf-8');
const LAYOUT = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'JoeIDELayout.tsx'), 'utf-8');
const PANEL = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'WorkspacePanel.tsx'), 'utf-8');
const JOE = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf-8');

describe('the server streams real code at real moments', () => {
    it('broadcasts each accepted section, in both build paths', () => {
        const calls = BUILDER.match(/streamCodeToLogs\(sessionId, (?:'index\.html'|page\.file), got\.html/g) || [];
        expect(calls.length).toBe(2);   // single page + site page
    });

    it('announces every finished file with done:true', () => {
        const dones = BUILDER.match(/streamCodeToLogs\([^)]*done: true/g) || [];
        // main write, repair rewrites, split trio, site pages
        expect(dones.length).toBeGreaterThanOrEqual(8);
    });

    it('never invents liveness — no timers around the stream', () => {
        // Trickling finished text through setInterval would be a fake typewriter.
        const helper = BUILDER.slice(BUILDER.indexOf('function streamCodeToLogs'),
            BUILDER.indexOf('function streamCodeToLogs') + 1600);
        expect(helper).not.toMatch(/setInterval|setTimeout/);
    });

    it('the build never depends on the UI listening', () => {
        const helper = BUILDER.slice(BUILDER.indexOf('function streamCodeToLogs'),
            BUILDER.indexOf('function streamCodeToLogs') + 1600);
        expect(helper).toMatch(/catch \{/);
    });
});

describe('the layout accumulates the stream correctly', () => {
    it('appends chunks and REPLACES on done', () => {
        // A done event carries the whole written file; appending it would
        // double the page in the panel.
        expect(LAYOUT).toMatch(/content: d\.done \? String\(d\.chunk \|\| cur\.content\)/);
        expect(LAYOUT).toMatch(/cur\.content \+ String\(d\.chunk \|\| ''\)/);
    });

    it('clears the slate when a new run starts', () => {
        expect(LAYOUT).toMatch(/run_started.*user_input[\s\S]{0,80}setLiveFiles\(\[\]\)/);
    });

    it('opens the Logs tab when live code arrives', () => {
        expect(LAYOUT).toContain("joe:open-logs-tab");
        expect(LAYOUT).toMatch(/handleOpenLogsTab[\s\S]{0,200}'logs'/);
    });
});

describe('the tab choreography matches the request', () => {
    it('a page build opens LOGS at start, not Preview', () => {
        const builder = JOE.indexOf("toolName === 'web_page_builder'");
        const logs = JOE.indexOf("setWorkspaceTab('logs')", builder);
        expect(builder).toBeGreaterThan(-1);
        expect(logs).toBeGreaterThan(builder);
        expect(JOE).toContain("msg.type === 'build_started' && (!buildTool || buildTool === 'web_page_builder')");
        // and web_page_builder is no longer in the open-preview-on-start list
        const previewList = JOE.match(/\[('dev_server'[^\]]*)\]/)?.[1] || '';
        expect(previewList).not.toContain('web_page_builder');
    });

    it('preview opens when the page is actually READY', () => {
        expect(JOE).toMatch(/preview_ready[\s\S]{0,600}setWorkspaceTab\('preview'\)/);
    });
});

describe('the panel renders what exists', () => {
    it('shows the code with a caret only while the file is still growing', () => {
        expect(PANEL).toMatch(/\{!f\.done && <span className="joe-live-caret">/);
    });

    it('respects reduced motion even for the caret', () => {
        expect(PANEL).toMatch(/prefers-reduced-motion[\s\S]{0,120}joe-live-caret\{ animation:none \}/);
    });

    it('counts live files into the Logs badge', () => {
        expect(PANEL).toMatch(/logs\.length \+ liveFiles\.length/);
    });
});


describe('explicit panel focus outranks live-code heuristics', () => {
    it('keeps a server-requested Terminal ahead of the file-stream Logs event', () => {
        expect(LAYOUT).toContain('const explicitPanel = useRef<WorkspaceTab | null>(null);');
        expect(LAYOUT).toMatch(/if \(data\?\.reason\) explicitPanel\.current = panel as WorkspaceTab/);
        expect(LAYOUT).toMatch(/if \(explicitPanel\.current && explicitPanel\.current !== 'logs'\) return/);
        expect(LAYOUT).toMatch(/explicitPanel\.current = null/);
    });

    it('does not let a React build_started event steal the Terminal tab', () => {
        expect(JOE).toContain("const buildTool = String(msg?.data?.tool || '');");
        expect(JOE).toMatch(/msg\.type === 'build_started' && \(!buildTool \|\| buildTool === 'web_page_builder'\)/);
    });
});

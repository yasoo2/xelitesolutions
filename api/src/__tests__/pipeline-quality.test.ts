/**
 * THREE DEFECTS FROM ONE BUILD LOG — «تبا لهيك نظام فاشل».
 *
 * 1. THE QUALITY PHASE COULD NEVER PASS. The system spine planned
 *    `browser_ui_audit` with `args: {}`, so the tool's first act was to answer
 *    `no_url`. Every system build ended «⛔ 2/3», and the self-repair that
 *    followed sent a browser agent to «Generate a URL for the quality phase»,
 *    read a file that did not exist, and died on «central_answer was called
 *    without a question».
 *
 * 2. THE BUILT STORE WAS HIJACKED BY ITS OWN PREVIEW. The interface finds its
 *    API by asking «does THIS origin answer /api/health?» — and Joe answers
 *    that too. Opened in Joe's preview, the store rewired itself to Joe's API:
 *    «GET /api/products 404», twice, every load.
 *
 * 3. AND IT COULD NOT READ ITS OWN SERVER ANYWAY. The generated API answers
 *    «{ ok, products }»; the reader knew items/data/posts/rows and nothing
 *    else. So every store, booking system and CRM Joe ever built stayed
 *    «local to this device» with a working database sitting right there.
 *
 * Live proof: src/tests/manual/verify_pipeline_quality.ts (16/16, a real
 * browser served from a foreign origin that answers /api/health).
 */
import { buildSpine } from '../modules/tools/definitions/ProjectPipelineTool';
import { adaptPlannedArgs } from '../core/orchestrator/plan-tools';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor, detectAppKind, type AppKind } from '../core/design/app-blueprints';

const REQUEST = 'متجر إلكتروني كامل مع سلة شراء';

describe('the quality phase is executable, not decorative', () => {
    it('the spine still ends with a real browser audit', () => {
        const phases = (buildSpine('system', REQUEST) as any).output.phases;
        expect(phases[2].tasks[0].tool).toBe('browser_ui_audit');
    });

    it('an audit with no address is completed from what the session built', () => {
        const key = `spec-${Date.now()}`;
        const before = adaptPlannedArgs('browser_ui_audit', { sessionId: key });
        expect(before.url).toBeUndefined();          // nothing built: no claim

        // …and once a build is registered, the address is the live preview.
        const projects: any = (global as any).joeProjects || ((global as any).joeProjects = {});
        const fs = require('fs'); const os = require('os'); const path = require('path');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-spine-'));
        fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html>');
        projects[key] = { dir, type: 'react' };
        try {
            const after = adaptPlannedArgs('browser_ui_audit', { sessionId: key });
            expect(after.url).toContain(`/project-preview/${key}/index.html`);
        } finally {
            delete projects[key];
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* fine */ }
        }
    });

    it('and the session reaches the adapter before it runs', () => {
        // Without this order the adapter cannot know whose build to audit —
        // which is the whole reason the URL was missing.
        const P = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf-8');
        expect(P.indexOf('planned.sessionId = executionContext.sessionId'))
            .toBeLessThan(P.indexOf('adaptPlannedArgs(toolName, planned)'));
    });
});

describe('the app talks to ITS server, and to no other', () => {
    const files = (req: string) => {
        const kind = detectAppKind(req) as AppKind;
        return buildAppFiles(
            blueprintFor(kind, req, false),
            { isArabic: false, brand: 'Joe', storeKey: 'k', api: 'http://localhost:4100/api/products' } as any,
            'app',
        );
    };

    it('the origin probe demands this system\'s own resource', () => {
        const store = files(REQUEST)['src/app/store.js'];
        expect(store).toMatch(/d\.resource === resource/);
        // «any server with a health endpoint» is exactly what hijacked it.
        expect(store).not.toMatch(/if \(r\.ok\) return '\/api\/' \+ tail;/);
    });

    it('…and the generated server puts its name in that answer', () => {
        const { ApiProjectTool } = require('../modules/tools/definitions/ApiProjectTool');
        expect(typeof ApiProjectTool).toBe('function');
        const src = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'modules', 'tools', 'definitions', 'ApiProjectTool.ts'), 'utf-8');
        expect(src).toMatch(/joe: 'api_project', resource: '\$\{resource\}'/);
        // the feed server too — it has its own health line
        expect(src).toMatch(/resource: 'posts'/);
    });

    it('the reader knows its own collection by name', () => {
        const store = files(REQUEST)['src/app/store.js'];
        expect(store).toMatch(/function resourceOf\(api\)/);
        expect(store).toMatch(/Array\.isArray\(d && d\[named\]\)/);
    });
});

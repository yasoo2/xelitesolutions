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
import { adaptPlannedArgs } from '../core/orchestrator/plan-tools';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor, detectAppKind, type AppKind } from '../core/design/app-blueprints';

const REQUEST = 'متجر إلكتروني كامل مع سلة شراء';

describe('the quality phase is executable, not decorative', () => {
    it('the evidence-first pipeline supplies discovery to the phase planner', () => {
        const fs = require('fs'); const path = require('path');
        const pipeline = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
        // Repointed: the pipeline now forwards the project root a caller may
        // supply, so the literal call text changed. The guarantee is unchanged —
        // discovery is still the first thing that runs.
        expect(pipeline).toContain("executeTool('engineering_discovery',");
        expect(pipeline).toContain("projectPath ? { request: productRequest, path: projectPath } : { request: productRequest }");
        // Repointed: the call now passes a prepared request and prepared
        // evidence rather than the raw two. What is guaranteed — and what this
        // measures — is that the pipeline plans through project_planner and
        // hands it the discovery evidence, not the spelling of its arguments.
        // …and the third argument grew again: the planner is now handed a
        // runnable-contract flag and its own deadline beside the context. The
        // sentence above says the spelling of the arguments is not the promise,
        // so the pin follows it — the call is matched across lines, and what is
        // asserted is that the description and the evidence are what it gets.
        expect(pipeline).toMatch(
            /executeTool\(\s*'project_planner',\s*\{\s*projectDescription:\s*\w+,\s*evidence:\s*\w+\s*\}/,
        );
        expect(pipeline).toMatch(/\.\.\.\(context \|\| \{\}\)/);
        expect(pipeline).toContain('AgentLoopService.runPlannedPhasesIfPresent');
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

    it('propagates an evidence-bound project root across the phase boundary', () => {
        const fs = require('fs'); const path = require('path');
        const P = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf-8');
        const A = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');
        expect(P).toContain('runtimeProjectEvidence');
        expect(P).toContain('projectRootRuntimeBound: true');
        expect(A).toContain('phaseResult?.output?.projectRoot');
        expect(A).toContain('executionContext.projectRoot = boundProjectRoot');
    });
});

describe('operational release boards are working task applications', () => {
    const RELEASE_READINESS_BOARD = 'ابنِ في مجلد عمل محلي معزول لوحة React عربية RTL باسم «مركز جاهزية الإصدار». يجب أن تعرض بطاقات مؤشرات، جدول مهام قابل للبحث والتصفية بحسب الحالة، نافذة تفاصيل للمهمة، ومفتاح نمط فاتح/داكن.';

    it('classifies the release-readiness board as a task application, never a landing page', () => {
        expect(detectAppKind(RELEASE_READINESS_BOARD)).toBe('tasks');
        const files = buildAppFiles(
            blueprintFor('tasks', RELEASE_READINESS_BOARD, true),
            { isArabic: true, brand: 'مركز جاهزية الإصدار', storeKey: 'release-ready' } as any,
            'app',
        );
        expect(files['src/App.jsx']).toMatch(/RecordsApp/);
        const program = Object.values(files).join('\n');
        const recordsApp = files['src/components/RecordsApp.jsx'];
        expect(program).toMatch(/search/i);
        expect(program).toMatch(/filter/i);
        expect(recordsApp).toMatch(/aria-haspopup="dialog"/);
        expect(recordsApp).toMatch(/role="dialog"/);
        expect(recordsApp).toMatch(/record-modal/);
    });

    it('does not mistake a procedural page-audit instruction for landing-page intent', () => {
        const fullOperationalRequest = `${RELEASE_READINESS_BOARD} شغّل الاختبارات محلياً ثم افتح معاينة محلية في المتصفح. دقّق الصفحة بنفسك: افحص أخطاء JavaScript وتفاعل البحث والتصفية ونافذة التفاصيل ومفتاح النمط.`;
        expect(detectAppKind(fullOperationalRequest)).toBe('tasks');
    });

    it('keeps the explicit release-board contract when incidental chat context is appended', () => {
        const mixedExecutionContext = `${RELEASE_READINESS_BOARD}\nسياق تنفيذي جانبي: راقب المحادثة السابقة بعد البناء.`;
        expect(detectAppKind(mixedExecutionContext)).toBe('tasks');
    });
});

describe('full-stack builders preserve the backend application contract', () => {
    it('persists the authoritative app kind for the later frontend phase', () => {
        const fs = require('fs'); const path = require('path');
        const api = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ApiProjectTool.ts'), 'utf-8');
        const react = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(api).toMatch(/const appKind = detectAppKind\(requestForReading\)/);
        expect(api).toMatch(/\.\.\.\(appKind \? \{ appKind \} : \{\}\)/);
        expect(react).toMatch(/const inheritedAppKind = prevEntry\?\.type === 'api'/);
        expect(react).toMatch(/const appKind = detectAppKind\(request\) \|\| inheritedAppKind/);
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

/**
 * …AND THE CHECK IS VISIBLE — «كيف بدنا نصلح المتصفح».
 *
 * The self-QA forced headless (killing an OS window that used to pop up
 * mid-build) and became invisible instead: «self-QA: 62/100» with nothing he
 * could look at. It now borrows Joe's OWN browser panel — no desktop window,
 * and no hidden process either. Live proof: verify_visible_audit.ts (15/15).
 */
describe('the self-QA runs where the user can watch it', () => {
    const A = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');

    it('the audit can borrow a live browser session instead of launching one', () => {
        expect(A).toMatch(/watchSessionId\?: string/);
        expect(A).toMatch(/getBrowserSession/);
        expect(A).toMatch(/borrowed = true/);
    });

    it('and never closes a browser it did not open', () => {
        expect(A).toMatch(/if \(!borrowed\) \{ try \{ await browser\?\.close\(\)/);
    });

    it('its listeners come off a page that outlives the audit', () => {
        expect(A).toMatch(/const unhook = \(\) =>/);
        expect(A).toMatch(/page\.off\('console', onConsole\)/);
    });

    it('the findings are drawn on the page, then cleaned up', () => {
        expect(A).toMatch(/data-joe-audit/);
        expect(A).toMatch(/querySelectorAll\('\[data-joe-audit\]'\)\.forEach\(e => e\.remove\(\)\)/);
    });

    it('the build asks for the panel, and the interface opens it by name', () => {
        const R = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(R).toMatch(/watchSessionId: PANEL_BROWSER_SID/);
        expect(R).toMatch(/type: 'panel_focus'/);
        const W = require('fs').readFileSync(
            require('path').join(__dirname, '..', '..', '..', 'web', 'src', 'services', 'AutoOpenManager.ts'), 'utf-8');
        // Guessing «browser» out of an English sentence never fired for Arabic.
        expect(W).toMatch(/event\.type === 'panel_focus'/);
    });
});

/**
 * A HUMAN CHECK IS NOT A DEAD END — «عاده ما يتوقف المتصفح اثبت انه انت بشري».
 *
 * Joe does not defeat these walls: no solver, no fingerprint spoofing, no
 * pretending to be a person. It stops provoking them (the agent no longer
 * scrapes google.com/search, which is what /sorry/ answers), detects one when
 * it appears anyway, hands the panel to the human who IS one, and resumes the
 * same task the moment it clears. Live proof: verify_human_check.ts (18/18).
 */
describe('a human check is handed to the human, not defeated', () => {
    const C = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'modules', 'browser', 'challenge.ts'), 'utf-8');

    it('the walls are recognised by URL and by wording', () => {
        expect(C).toMatch(/sorry\\\/index/);
        expect(C).toMatch(/unusual traffic/);
        expect(C).toMatch(/cdn-cgi\\\/challenge-platform/);
    });

    it('and a reCAPTCHA widget inside a real page is NOT one', () => {
        // A rescue that fires on every contact form is a nuisance.
        expect(C).toMatch(/length < 1200/);
    });

    it('the loop waits for the human instead of dying at a checkbox', () => {
        const L = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'modules', 'browser', 'reactLoop.ts'), 'utf-8');
        expect(L).toMatch(/const wall = await detectChallenge\(page\)/);
        expect(L).toMatch(/waitForHumanToClear/);
        // …and when nobody clears it, it stops honestly.
        expect(L).toMatch(/لم يُستكمل التحقّق/);
    });

    it('the agent searches where automation is welcome', () => {
        expect(C).toMatch(/export function agentSearchUrl/);
        for (const f of ['modules/browser/runner.ts', 'modules/tools/definitions/BrowserRunTool.ts',
            'orchestration/agents/BrowserAgent.ts', 'modules/services/ToolService.ts']) {
            const src = require('fs').readFileSync(require('path').join(__dirname, '..', f), 'utf-8');
            expect(`${f}: ${/google\.com\/search\?q=\$\{encodeURIComponent/.test(src) ? 'scrapes' : 'clean'}`)
                .toBe(`${f}: clean`);
        }
    });

    it('and nothing here solves a CAPTCHA', () => {
        // The line this project will not cross, kept as a gate so it stays uncrossed.
        expect(C).not.toMatch(/2captcha|anti-?captcha|capmonster|solveRecaptcha|deathbycaptcha/i);
        expect(C).not.toMatch(/puppeteer-extra-plugin-stealth|navigator\.webdriver\s*=/i);
    });
});

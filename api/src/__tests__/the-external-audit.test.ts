/**
 * AN OUTSIDE AUDIT CAME BACK, AND MOST OF IT WAS TRUE.
 *
 * «لقد طلبت من مانوس فحص وتحليل النظام … لكن انا لا اثق بمانوس»
 *
 * He was right not to take it on faith, and right to ask for it to be checked.
 * Every finding below was reproduced here before a line was changed — the port
 * really was published to every interface, the key really was committed, the
 * restore really did fail on a machine with no artifacts directory, the lint
 * really could not run. Two claims did not survive contact: the version-history
 * failures are not a flaw in the test but a latent bug it exposes only on a
 * clean machine, and the «21 vulnerabilities» were counted with dev tooling
 * included on the web side, which is a different fact from what ships.
 *
 * This file is the part that outlives the report: each fix, pinned, so the
 * next refactor cannot quietly undo it.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf-8');
const PROD = read('infra', 'docker-compose.production.yml');
const SERVER = read('infra', 'docker-compose.server.yml');
const WORKER = read('services', 'joe-browser-worker', 'src', 'index.ts');
const DEPLOY = read('.github', 'workflows', 'system-update.yml');
const CI = read('.github', 'workflows', 'ci.yml');
const PAGE_TOOL = read('api', 'src', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts');

/**
 * H-01, the one worth losing sleep over: port 5050 is the socket that drives a
 * real Chromium. Published on 0.0.0.0, anyone who can reach the host can
 * connect a Playwright client to it and browse as this service — through the
 * firewall, into internal addresses, inside whatever session that browser holds.
 */
describe('the browser worker is not on the public internet', () => {
    it('neither of its ports is published to the host', () => {
        expect(PROD).not.toMatch(/^\s+-\s+"5050:5050"/m);
        expect(PROD).not.toMatch(/^\s+-\s+"7070:7070"/m);
        expect(SERVER).not.toMatch(/^\s+-\s+"5050:5050"/m);
        expect(SERVER).not.toMatch(/^\s+-\s+"7070:7070"/m);
    });

    it('…and the file still binds its OTHER services to the loopback, as it always did', () => {
        // Mongo and Ollama were already correct — which is what made the
        // browser worker's line stand out as an oversight rather than a policy.
        expect(PROD).toMatch(/"127\.0\.0\.1:27017:27017"/);
        expect(PROD).toMatch(/"127\.0\.0\.1:11434:11434"/);
    });

    it('the api still reaches it by service name over the private network', () => {
        expect(SERVER).toMatch(/BROWSER_WS_ENDPOINT=ws:\/\/browser-worker:5050\/ws/);
    });
});

describe('the worker fails CLOSED', () => {
    /**
     * The old guard read `if (API_KEY && header !== ...)`. Read it again: with
     * no key set, the condition is false and the request goes through. The one
     * configuration where nobody has thought about authentication was the one
     * with none.
     */
    it('no key means the process refuses to start — never «allow everyone»', () => {
        expect(WORKER).toMatch(/if \(!API_KEY\) \{/);
        expect(WORKER).toMatch(/process\.exit\(1\);/);
        expect(WORKER).not.toMatch(/if \(API_KEY && req\.headers\['authorization'\]/);
    });

    it('every control route goes through one guard', () => {
        expect((WORKER.match(/if \(!authorized\(req\)\)/g) || []).length).toBeGreaterThanOrEqual(2);
        expect(WORKER).toMatch(/function authorized\(req: express\.Request\): boolean/);
    });

    it('…and the comparison is timing-safe', () => {
        expect(WORKER).toMatch(/crypto\.timingSafeEqual/);
        // Lengths are compared first: timingSafeEqual throws on a mismatch.
        expect(WORKER).toMatch(/if \(given\.length !== want\.length\) return false;/);
    });

    it('CORS answers a list, not everyone', () => {
        expect(WORKER).not.toMatch(/app\.use\(cors\(\)\);/);
        expect(WORKER).toMatch(/const ALLOWED_ORIGINS/);
        expect(WORKER).toMatch(/ALLOWED_ORIGINS\.includes\(origin\)/);
    });
});

describe('no key is committed to the repository', () => {
    it('the alternate deploy file no longer carries a literal', () => {
        expect(SERVER).not.toContain('joe_secret_browser_key');
        expect((SERVER.match(/WORKER_API_KEY=\$\{WORKER_API_KEY:\?/g) || []).length).toBe(2);
    });

    it('and no compose file in the repo hardcodes one', () => {
        for (const f of ['docker-compose.production.yml', 'docker-compose.server.yml']) {
            const text = read('infra', f);
            expect(text).not.toMatch(/WORKER_API_KEY\s*[:=]\s*[A-Za-z0-9_-]{6,}\s*$/m);
        }
    });
});

describe('a deploy has to pass the tests first', () => {
    it('the deploy job waits on a gate that really runs them', () => {
        expect(DEPLOY).toMatch(/needs: gate/);
        expect(DEPLOY).toMatch(/uses: \.\/\.github\/workflows\/ci\.yml/);
        expect(CI).toMatch(/workflow_call:/);
        expect(CI).toMatch(/npm --prefix api test/);
        expect(CI).toMatch(/npm --prefix api run build/);
        expect(CI).toMatch(/npm --prefix web run type-check/);
    });

    /**
     * The last line of the deploy said `-f docker-compose.production.yml` from
     * the repository root, while every other call in the same job correctly
     * said `infra/…`. Under `set -e` that turns a deploy that actually worked
     * into a red workflow — and there is a real failed run in the history.
     */
    it('and every compose call in it points at the file that exists', () => {
        const calls = DEPLOY.match(/docker compose[^\n]*-f\s+(\S+)/g) || [];
        expect(calls.length).toBeGreaterThan(0);
        for (const c of calls) {
            expect(c).toMatch(/-f\s+infra\/docker-compose\.production\.yml/);
        }
    });
});

/**
 * M-01, reproduced before it was fixed: with /tmp/joe-artifacts moved aside,
 * two tests in version-history.test.ts failed — restoring v1, and rolling back
 * again to v2 — because the restore wrote into a directory nothing had created
 * yet. On this machine a previous build usually creates it, which is exactly
 * why the bug survived: it only appears on a fresh install, a cleaned /tmp, or
 * a user whose first action after a restart is «ارجع للنسخة السابقة».
 */
describe('an artifact write makes its own directory', () => {
    it('there is one helper, and it creates the parent first', () => {
        expect(PAGE_TOOL).toMatch(/function writeArtifact\(rel: string, content: string\): void \{/);
        expect(PAGE_TOOL).toMatch(/fs\.mkdirSync\(path\.dirname\(abs\), \{ recursive: true \}\);/);
    });

    it('and NO write bypasses it — the hole is closed as a class, not as an instance', () => {
        expect(PAGE_TOOL).not.toMatch(/fs\.writeFileSync\(path\.join\(ARTIFACT_DIR,/);
        expect((PAGE_TOOL.match(/writeArtifact\(/g) || []).length).toBeGreaterThanOrEqual(6);
    });

    it('the restore path in particular uses it', () => {
        expect(PAGE_TOOL).toMatch(/writeArtifact\(prev\.filename, target\.html\);/);
    });
});

describe('the dependency floor was raised, and the classification corrected', () => {
    const pkg = (...p: string[]) => JSON.parse(read(...p));

    it('the two vulnerable direct API packages are off their old majors', () => {
        const d = pkg('api', 'package.json').dependencies;
        expect(d['adm-zip']).toMatch(/\^0\.6/);
        expect(d.axios).toMatch(/\^1\.(1[8-9]|[2-9]\d)/);
    });

    it('vite is a BUILD tool, so it is a devDependency now', () => {
        const w = pkg('web', 'package.json');
        expect(w.dependencies?.vite).toBeUndefined();
        expect(w.devDependencies?.vite).toMatch(/\^6\./);
        // Listed under `dependencies`, it counted as something the product
        // ships — so every «what actually ships» audit was measuring the
        // build toolchain too.
        expect(w.devDependencies?.['@vitejs/plugin-react-swc']).toBeTruthy();
    });

    it('the web lint can run at all — its plugin is installed and registered', () => {
        const w = pkg('web', 'package.json');
        expect(w.devDependencies?.['eslint-plugin-react-hooks']).toBeTruthy();
        const cfg = read('web', 'eslint.config.js');
        expect(cfg).toMatch(/import reactHooks from 'eslint-plugin-react-hooks';/);
        expect(cfg).toMatch(/'react-hooks': reactHooks/);
        expect(cfg).toMatch(/'react-hooks\/rules-of-hooks': 'error'/);
    });
});

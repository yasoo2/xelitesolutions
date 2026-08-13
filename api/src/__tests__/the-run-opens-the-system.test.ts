/**
 * «ما هذا الذي فتحه جو؟؟؟»
 *
 *     > dar-al-rifq@0.1.0 dev
 *     > vite
 *     Port 5173 is in use, trying another one...
 *     ➜  Local:   http://localhost:5174/
 *
 * The finished system was the API server beside that folder, with the built
 * interface already copied into its public/ — one origin, one «npm start».
 * What opened instead was a programmer's hot-reload server over the SOURCE,
 * with no database behind it, on a port nobody chose, while Joe announced a
 * different port and handed over a URL that answered nothing.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectStart } from '../modules/tools/definitions/ProjectRunTool';

const RUNTOOL = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'), 'utf-8');
const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

/** A throwaway project on disk — detectStart reads files, so it needs files. */
function project(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-detect-'));
    for (const [name, body] of Object.entries(files)) {
        const full = path.join(dir, name);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, body);
    }
    return dir;
}

const VITE_PKG = JSON.stringify({
    name: 'dar-al-rifq', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    devDependencies: { vite: '^5.4.11' },
});

describe('the port Joe announces is the port it binds', () => {
    it('tells vite the port in the flag vite actually reads', () => {
        const d = detectStart(project({ 'package.json': VITE_PKG }), 4321);
        expect(d.kind).toBe('dev-server');
        expect(d.command).toContain('--port 4321');
    });

    it('and --strictPort, so it fails loudly instead of drifting to 5174', () => {
        const d = detectStart(project({ 'package.json': VITE_PKG }), 4321);
        expect(d.command).toContain('--strictPort');
        expect(d.forced).toBe(true);
    });

    it('recognises vite by its config file too, not only by package.json', () => {
        const d = detectStart(project({
            'package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
            'vite.config.js': 'export default {};',
        }), 4400);
        expect(d.command).toContain('--port 4400');
    });

    it('next gets its own flag spelling', () => {
        const d = detectStart(project({
            'package.json': JSON.stringify({ scripts: { dev: 'next dev' }, dependencies: { next: '14' } }),
        }), 4500);
        expect(d.command).toContain('--port 4500');
        expect(d.forced).toBe(true);
    });

    /**
     * PORT is a real contract for these, so nothing is appended — but the port
     * is NOT forced, and that distinction is what stops the readiness probe
     * from adopting somebody else's server.
     */
    it('a PORT-reading server is left alone, and marked unforced', () => {
        const d = detectStart(project({
            'package.json': JSON.stringify({ scripts: { start: 'node server.js' } }),
        }), 4600);
        expect(d.kind).toBe('npm-start');
        expect(d.command).toBe('npm start');
        expect(d.forced).toBe(false);
    });

    it('a static folder is served on OUR port, which is therefore forced', () => {
        const d = detectStart(project({ 'index.html': '<h1>hi</h1>' }), 4700);
        expect(d.command).toContain('-l 4700');
        expect(d.forced).toBe(true);
    });
});

describe('readiness does not adopt a stranger\'s server', () => {
    it('a forced port is probed alone — the common-port hunt is for hopes only', () => {
        expect(RUNTOOL).toContain(
            'const probeList = detected.forced ? [port] : [port, ...COMMON_DEV_PORTS.filter(p => p !== port)];');
    });

    it('an unconfirmed server yields an explicit verification failure, never a dead URL', () => {
        const at = RUNTOOL.indexOf('if (!livePort) {');
        const block = RUNTOOL.slice(at, at + 2600);
        expect(at).toBeGreaterThan(-1);
        expect(block).not.toMatch(/url: `http:\/\/localhost:\$\{port\}\//);
        expect(block).toContain('ok: false');
        expect(block).toContain('verificationFailed: true');
        expect(block).toContain("note: 'started_not_confirmed'");
        expect(block).toContain('command: detected.command');
    });
});

/**
 * «لكن لم ارى النظام جو اثناء تطبيق البروميت انه قام بتشغيل الثيرمال خاصته
 *  واجرى الاختبارات اللازمه»
 *
 * He is right, and one comment in the build explained it: «The measurement is
 * over; the system he deploys is his to start». Joe started the packaged
 * server, opened a real browser on it, measured 63/100, repaired it to 73,
 * measured again — and then killed it. The only minute his system was alive
 * was the minute it was reserved for Joe's own tests.
 */
describe('the system that passed the test is the system he gets', () => {
    it('the server that answered the audit is no longer killed after it', () => {
        expect(REACT).not.toContain('self-QA: stopped the server that was started for the measurement');
        expect(REACT).toMatch(/self-QA: the system stays UP at \$\{liveServer\.url\}/);
    });

    it('it carries a port and a pid, so it can be handed on and stopped later', () => {
        expect(REACT).toMatch(/let liveServer: \{ url: string; port: number; pid\?: number; stop: \(\) => void \} \| null/);
        expect(REACT).toMatch(/return \{ url, port, pid: child\.pid, stop:/);
    });

    it('the preview panel is told where it is', () => {
        const at = REACT.indexOf('self-QA: the system stays UP');
        const block = REACT.slice(at, at + 900);
        expect(block).toContain("type: 'preview_ready'");
        expect(block).toContain('url: liveServer.url');
    });

    it('a previous build\'s server is stopped, so ports do not pile up', () => {
        const at = REACT.indexOf('self-QA: the system stays UP');
        expect(REACT.slice(Math.max(0, at - 400), at)).toContain('process.kill(prevPid)');
    });

    it('and the address is remembered on the project', () => {
        expect(REACT).toMatch(/live: \{ url: liveServer\.url, port: liveServer\.port, pid: liveServer\.pid, at: Date\.now\(\) \}/);
    });
});

describe('an already-running system is adopted, not raced', () => {
    it('project_run probes the remembered address before starting anything', () => {
        expect(RUNTOOL).toContain('const live = activeProj?.live;');
        expect(RUNTOOL).toMatch(/if \(!input\?\.cwd && !input\?\.command && liveUrl && await answersHttp\(liveUrl\)\)/);
        expect(RUNTOOL).toMatch(/adopted: true, kind: 'already-running'/);
    });

    /**
     * An open TCP port proves someone is listening, not that it is your
     * project — and the remembered address outlives the process that wrote it.
     */
    it('adoption needs a real HTTP answer, not just an open port', () => {
        expect(RUNTOOL).toMatch(/async function answersHttp\(url: string, timeoutMs = 2500\): Promise<boolean>/);
        expect(RUNTOOL).toContain('return res.status < 500;');
    });

    it('an explicit cwd or command still starts fresh — adoption is the default only', () => {
        expect(RUNTOOL).toContain('!input?.cwd && !input?.command && liveUrl');
    });
});

describe('what Joe opens is the system, not its source folder', () => {
    it('the react build records WHICH folder became the whole system', () => {
        expect(REACT).toMatch(/\.\.\.\(packaged && apiDir \? \{ packagedInto: apiDir \} : \{\}\),/);
    });

    it('project_run prefers that folder, and only when it really holds the built UI', () => {
        expect(RUNTOOL).toMatch(/const packagedInto = String\(activeProj\?\.packagedInto \|\| activeProj\?\.linkedApiDir \|\| ''\)/);
        expect(RUNTOOL).toContain("fs.existsSync(path.join(packagedInto, 'public', 'index.html'))");
        expect(RUNTOOL).toContain("fs.existsSync(path.join(packagedInto, 'package.json'))");
    });

    it('an explicit cwd still wins — this is a default, not a hijack', () => {
        // `explicitCwd` is intentionally normalized once, then takes precedence
        // over a packaged server and every discovery fallback.
        expect(RUNTOOL).toContain("const explicitCwd = String(input?.cwd || '').trim();");
        expect(RUNTOOL).toMatch(/const baseCwd = explicitCwd\s*\n\s*\|\| \(packagedIsWhole \? packagedInto : ''\)/);
        expect(RUNTOOL).toContain('if (!input?.cwd && packagedIsWhole)');
    });

    it('and it says so out loud, in both languages', () => {
        expect(RUNTOOL).toMatch(/📦 الواجهة محزومة داخل الخادم/);
        expect(RUNTOOL).toMatch(/📦 The interface is packaged inside the server/);
    });

    it('a packaged server starts with npm start, not npm run dev', () => {
        const d = detectStart(project({
            'package.json': JSON.stringify({ scripts: { start: 'node server.js', dev: 'vite' } }),
            'public/index.html': '<h1>packaged</h1>',
        }), 4800);
        expect(d.command).toBe('npm start');
    });
});

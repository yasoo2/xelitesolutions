import { ToolDefinition, ToolPermission } from '../types';
import { ExecutionGateway } from '../../../kernel/ExecutionGateway';
import { workspaceService } from '../../services/WorkspaceService';
import { isPortOpen } from '../../../shared/utils/network';
import * as fs from 'fs';
import * as path from 'path';

/**
 * project_run / project_stop — actually RUN a built system, not just render a
 * static page.
 *
 * A web PAGE previews by loading an HTML file. A SYSTEM (a Node/Express backend,
 * a React/Vite app, a full-stack project) is a PROGRAM: it must be started, kept
 * alive on a port, and only then can the user open it, click its buttons, and
 * see its database respond. The project pipeline built and tested systems but
 * never ran them — so a finished system sat inert on disk. This closes that gap.
 *
 * Windows-first: a free port is found by probing, the process is started through
 * the sanctioned ExecutionGateway (never child_process), and project_stop kills
 * the whole tree with taskkill on Windows / the process group on POSIX.
 */

// Live processes, keyed by the workspace (or session) so one project owns one
// server: starting again stops the previous one instead of leaking ports.
interface RunningServer { pid: number; port: number; cwd: string; command: string; startedAt: number; }
const RUNNING: Map<string, RunningServer> = new Map();

// Ports frameworks commonly bind to when they ignore our PORT hint. Probed
// after the chosen port so we DISCOVER the real one instead of guessing.
const COMMON_DEV_PORTS = [5173, 5174, 3000, 3001, 4173, 8080, 8000];

async function findFreePort(start = 4300): Promise<number> {
    for (let p = start; p < start + 200; p++) {
        if (!(await isPortOpen('127.0.0.1', p))) return p;
    }
    return start;
}

function runKey(context?: any): string {
    return String(context?.workspaceId || context?.sessionId || 'default');
}

/** Detects how THIS project starts, from its files — not a guess. */
function detectStart(cwd: string, port: number): { command: string; kind: string; expectPort: number } {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
        let scripts: Record<string, string> = {};
        try { scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).scripts || {}; } catch { /* malformed */ }
        // A frontend dev server (Vite/Next/CRA): it picks its own port; we set
        // PORT and also discover via probing.
        if (scripts.dev) return { command: 'npm run dev', kind: 'dev-server', expectPort: port };
        // A generic start script — most Node servers read process.env.PORT.
        if (scripts.start) return { command: 'npm start', kind: 'npm-start', expectPort: port };
    }
    // A bare Node server entry that listens.
    for (const entry of ['server.js', 'app.js', 'index.js', 'main.js', 'src/server.js', 'src/index.js']) {
        const f = path.join(cwd, entry);
        if (fs.existsSync(f)) {
            try {
                if (/\.listen\s*\(/.test(fs.readFileSync(f, 'utf-8'))) {
                    return { command: `node ${entry}`, kind: 'node-entry', expectPort: port };
                }
            } catch { /* unreadable */ }
        }
    }
    // A static site — serve the folder deterministically on our port.
    if (fs.existsSync(path.join(cwd, 'index.html'))) {
        return { command: `npx -y serve -l ${port} -s . --no-clipboard`, kind: 'static', expectPort: port };
    }
    // Last resort: try npm start and let readiness probing sort it out.
    return { command: 'npm start', kind: 'unknown', expectPort: port };
}

export class ProjectRunTool implements ToolDefinition {
    name = 'project_run';
    version = '1.0.0';
    description = 'Run the built project as a LIVE server (Node/React/full-stack/static), wait until it responds, and open its live preview. Use to actually start and view a system, not just a static page.';
    tags = ['run', 'server', 'preview', 'live'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            cwd: { type: 'string' as const, description: 'Project directory. Defaults to the active workspace root.' },
            command: { type: 'string' as const, description: 'Override the start command (auto-detected otherwise).' },
            port: { type: 'number' as const, description: 'Preferred port (a free one is chosen otherwise).' },
        },
    };
    outputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const }, port: { type: 'number' as const }, ready: { type: 'boolean' as const } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 10;
    auditFields = ['cwd', 'command'];
    mockSupported = false;

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const say = (m: string) => { logs.push(m); context?.onProgress?.(m); };
        // [AUDIT INTEGRATION] «شغّل المشروع» right after a scaffold/import
        // used to start the WORKSPACE ROOT, not the project the session just
        // created — the two stores never talked. The session's active
        // project is the default now; an explicit cwd still wins.
        const activeProj = (global as any).joeProjects?.[String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_')];
        const cwd = String(input?.cwd || '').trim()
            || (activeProj?.dir && fs.existsSync(activeProj.dir) ? String(activeProj.dir) : '')
            || workspaceService.getActiveRoot(context?.workspaceId);
        if (!fs.existsSync(cwd)) return { ok: false, error: `مسار المشروع غير موجود: ${cwd}`, logs };
        if (activeProj?.dir === cwd) logs.push(`project_run: using the session's active project (${cwd})`);
        // Falling back to the workspace root is deliberate — «شغّل المشروع»
        // right after a build must work with no arguments. But a root that
        // holds no project at all is not a project: without this, an empty
        // call spawned `npm start` in a folder with nothing to start, and
        // waited 45s for a server that was never coming.
        if (!input?.command && !['package.json', 'index.html', 'server.js', 'app.py', 'main.py', 'index.js']
            .some(f => fs.existsSync(path.join(cwd, f)))) {
            return { ok: false, error: `لا يوجد مشروع قابل للتشغيل في ${cwd} — ابنِ مشروعاً أولاً أو مرّر cwd.`, logs };
        }

        const key = runKey(context);
        // One project, one server: stop a previous run before starting again.
        await stopServer(key, logs).catch(() => {});

        const port = Number(input?.port) || await findFreePort();
        const detected = input?.command
            ? { command: String(input.command), kind: 'override', expectPort: port }
            : detectStart(cwd, port);
        say(`▶️ أُشغّل المشروع (${detected.kind}) على المنفذ ${port}…`);

        // Detached start through the sanctioned gateway — never child_process.
        const res = await ExecutionGateway.execute(detected.command, [], {
            cwd,
            env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', BROWSER: 'none', CI: '1' },
            detached: true,
            shell: true,
            stdio: 'ignore',
        });
        if (!res.success || res.data?.ok === false) {
            return { ok: false, error: `تعذّر تشغيل الخادم: ${res.error || res.data?.error || 'unknown'}`, logs };
        }
        const pid = res.data?.pid;

        // Readiness: probe the chosen port first, then the common framework ports,
        // so we DISCOVER where it actually bound instead of assuming.
        const probeList = [port, ...COMMON_DEV_PORTS.filter(p => p !== port)];
        let livePort = 0;
        const deadline = Date.now() + 45000; // weak machines + npm cold start
        while (Date.now() < deadline && !livePort) {
            await new Promise(r => setTimeout(r, 700));
            for (const p of probeList) {
                if (await isPortOpen('127.0.0.1', p)) { livePort = p; break; }
            }
        }

        if (pid) RUNNING.set(key, { pid, port: livePort || port, cwd, command: detected.command, startedAt: Date.now() });

        if (!livePort) {
            say('⏳ بدأ الخادم لكنه لم يستجب بعد — قد يحتاج وقتاً أطول على جهاز ضعيف.');
            return {
                ok: true,
                output: { url: `http://localhost:${port}/`, port, ready: false, pid, note: 'started_not_confirmed' },
                logs,
            };
        }

        const url = `http://localhost:${livePort}/`;
        say(`✅ المشروع يعمل الآن — المعاينة الحية: ${url}`);
        // The preview panel opens automatically on this event.
        try {
            const { broadcast } = require('../../ws');
            broadcast({ type: 'preview_ready', sessionId: context?.sessionId, data: { url, previewUrl: url, port: livePort, live: true } });
        } catch { /* panel optional */ }

        return { ok: true, output: { url, previewUrl: url, port: livePort, ready: true, pid, kind: detected.kind }, logs };
    }
}

async function stopServer(key: string, logs: string[]): Promise<boolean> {
    const server = RUNNING.get(key);
    if (!server?.pid) return false;
    const pid = server.pid;
    try {
        if (process.platform === 'win32') {
            // Kills the whole process tree (npm -> the framework it spawned).
            await ExecutionGateway.execute(`taskkill /F /T /PID ${pid}`, [], { shell: true, stdio: 'ignore' });
        } else {
            // Detached start makes the child a group leader; -pid kills the group.
            try { process.kill(-pid, 'SIGTERM'); } catch { process.kill(pid, 'SIGTERM'); }
        }
        logs.push(`stopped pid=${pid} port=${server.port}`);
    } catch (e: any) {
        logs.push(`stop_failed pid=${pid}: ${e?.message || e}`);
    }
    RUNNING.delete(key);
    return true;
}

export class ProjectStopTool implements ToolDefinition {
    name = 'project_stop';
    version = '1.0.0';
    description = 'Stop the live server started by project_run for the current project.';
    tags = ['run', 'server', 'stop'];
    inputSchema = { type: 'object' as const, properties: {} };
    outputSchema = { type: 'object' as const, properties: { stopped: { type: 'boolean' as const } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 20;
    auditFields = [];
    mockSupported = false;

    async execute(_input: any, context?: any) {
        const logs: string[] = [];
        const key = runKey(context);
        const server = RUNNING.get(key);
        if (!server) return { ok: true, output: { stopped: false, message: 'لا يوجد خادم يعمل لهذا المشروع.' }, logs };
        await stopServer(key, logs);
        return { ok: true, output: { stopped: true, message: `تم إيقاف الخادم (المنفذ ${server.port}).`, port: server.port }, logs };
    }
}

// Exposed so the pipeline can auto-run after a verified build.
export { RUNNING as _runningServers };

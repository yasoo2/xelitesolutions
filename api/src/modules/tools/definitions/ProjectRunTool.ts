import { ToolDefinition, ToolPermission } from '../types';
import { ExecutionGateway } from '../../../kernel/ExecutionGateway';
import { workspaceService } from '../../services/WorkspaceService';
import { isPortOpen } from '../../../shared/utils/network';
import { isArabicReply, say as pick } from '../../../shared/reply-language';
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

/**
 * An open TCP port is not a running project.
 *
 * The recorded address survives a Joe restart, which is what makes adoption
 * worth having — but so does the possibility that something else took that
 * port meanwhile. A port that accepts a connection proves only that SOMEONE
 * is listening; an HTTP answer proves it is a web server, and that is the
 * least we should know before calling it «your system».
 */
async function answersHttp(url: string, timeoutMs = 2500): Promise<boolean> {
    try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), timeoutMs);
        const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
        clearTimeout(t);
        return res.status < 500;
    } catch {
        return false;
    }
}

function runKey(context?: any): string {
    return String(context?.workspaceId || context?.sessionId || 'default');
}

/**
 * THE PORT WE ANNOUNCE MUST BE THE PORT IT BINDS.
 *
 * What he saw on his screen, after Joe said «على المنفذ 4300»:
 *
 *     > dar-al-rifq@0.1.0 dev
 *     > vite
 *     Port 5173 is in use, trying another one...
 *     ➜  Local:   http://localhost:5174/
 *
 * Three separate lies in five lines. Vite does not read `PORT` — it reads
 * `--port` — so the environment variable we set was ignored and it went to
 * its own default. That default was already taken by a PREVIOUS run of the
 * same project that nobody stopped, so it drifted again, silently. And the
 * URL Joe handed him, `http://localhost:4300/`, pointed at nothing at all:
 * that is the `ERR_CONNECTION_REFUSED` he reported.
 *
 * A hint that a framework is free to ignore is not a decision. Each dev
 * server is now told its port in the flag IT reads, and Vite is additionally
 * told `--strictPort`: bind this port or fail loudly. Drifting to a port
 * nobody was told about is worse than not starting.
 */
function devServerPortFlags(cwd: string, port: number): string {
    const has = (f: string) => fs.existsSync(path.join(cwd, f));
    let deps: Record<string, string> = {};
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
        deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    } catch { /* malformed package.json — fall through to the file probe */ }

    if (deps.vite || has('vite.config.js') || has('vite.config.ts')) {
        return ` -- --port ${port} --strictPort --host 127.0.0.1`;
    }
    if (deps.next || has('next.config.js') || has('next.config.mjs')) {
        return ` -- --port ${port} --hostname 127.0.0.1`;
    }
    // Create React App, Parcel, Angular and plain `node` servers all read PORT
    // from the environment, which is already set.
    return '';
}

/**
 * How THIS project starts, from its files — not a guess.
 *
 * `forced` says whether the port is a COMMAND, not a hope: a flag the
 * framework must obey, or a static server we point ourselves. It decides
 * whether readiness may go looking on other ports (see below).
 */
export function detectStart(cwd: string, port: number): { command: string; kind: string; expectPort: number; forced: boolean } {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
        let scripts: Record<string, string> = {};
        try { scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).scripts || {}; } catch { /* malformed */ }
        // A generic start script comes FIRST for a packaged system: `npm start`
        // serves the built interface AND its API from one origin, which is the
        // thing he asked for. `npm run dev` is a source-code tool.
        if (scripts.start) return { command: 'npm start', kind: 'npm-start', expectPort: port, forced: false };
        // A frontend dev server (Vite/Next/CRA) — told its port in the flag it
        // actually reads, so the announcement below is true.
        if (scripts.dev) {
            const flags = devServerPortFlags(cwd, port);
            return { command: `npm run dev${flags}`, kind: 'dev-server', expectPort: port, forced: !!flags };
        }
    }
    // A bare Node server entry that listens.
    for (const entry of ['server.js', 'app.js', 'index.js', 'main.js', 'src/server.js', 'src/index.js']) {
        const f = path.join(cwd, entry);
        if (fs.existsSync(f)) {
            try {
                if (/\.listen\s*\(/.test(fs.readFileSync(f, 'utf-8'))) {
                    return { command: `node ${entry}`, kind: 'node-entry', expectPort: port, forced: false };
                }
            } catch { /* unreadable */ }
        }
    }
    // A static site — serve the folder deterministically on our port.
    if (fs.existsSync(path.join(cwd, 'index.html'))) {
        return { command: `npx -y serve -l ${port} -s . --no-clipboard`, kind: 'static', expectPort: port, forced: true };
    }
    // Last resort: try npm start and let readiness probing sort it out.
    return { command: 'npm start', kind: 'unknown', expectPort: port, forced: false };
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
        // The run lines land in the same trace as the build's — so they follow
        // the same language. There is no request text here, so the interface's
        // setting is the only evidence, and English is what «unset» means for a
        // machine-shaped line like «dev-server on port 4300».
        const isAr = isArabicReply({ language: context?.language });
        // [AUDIT INTEGRATION] «شغّل المشروع» right after a scaffold/import
        // used to start the WORKSPACE ROOT, not the project the session just
        // created — the two stores never talked. The session's active
        // project is the default now; an explicit cwd still wins.
        const activeProj = (global as any).joeProjects?.[String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_')];

        /**
         * RUN THE SYSTEM, NOT ITS SOURCE FOLDER.
         *
         * The React build ends by copying its compiled interface into the API
         * server's `public/` — «one origin, one npm start», the folder he can
         * upload to a domain. Then the pipeline called project_run, which took
         * the session's active project (the React SOURCE directory) and started
         * `vite`. So what opened was a developer's hot-reload server for the
         * source code, on a port nobody chose, with NO backend behind it — the
         * database, the sign-in, the admin panel and every table were in the
         * server that was never started.
         *
         * He asked «ما هذا الذي فتحه جو؟» about exactly that window, and the
         * honest answer was: the wrong half of his own system.
         *
         * When the interface has been packaged into its server, the SERVER is
         * the project. It serves the same interface at `/` and answers its own
         * API on the same origin.
         */
        /**
         * IF IT IS ALREADY RUNNING, IT IS ALREADY RUNNING.
         *
         * The build ends with the packaged system UP — a real browser has just
         * loaded it and its API has just answered. Starting a second copy on a
         * second port is not «running the project»; it is a race with the
         * thing that already works, and the loser is whatever the user is
         * looking at.
         *
         * So the recorded address is probed first. If it answers, that IS the
         * project, and this tool's job is to point at it.
         */
        const live = activeProj?.live;
        const liveUrl = String(live?.url || (live?.port ? `http://localhost:${live.port}/` : ''));
        if (!input?.cwd && !input?.command && liveUrl && await answersHttp(liveUrl)) {
            say(pick(isAr,
                `✅ نظامك يعمل بالفعل — المعاينة الحية: ${liveUrl}`,
                `✅ Your system is already running — live preview: ${liveUrl}`));
            try {
                const { broadcast } = require('../../ws');
                broadcast({
                    type: 'preview_ready', sessionId: context?.sessionId,
                    data: { url: liveUrl, previewUrl: liveUrl, port: Number(live.port), live: true },
                } as any);
            } catch { /* panel optional */ }
            return {
                ok: true,
                output: {
                    url: liveUrl, previewUrl: liveUrl, port: Number(live.port),
                    ready: true, pid: live.pid, adopted: true, kind: 'already-running',
                },
                logs,
            };
        }

        const packagedInto = String(activeProj?.packagedInto || activeProj?.linkedApiDir || '').trim();
        const packagedIsWhole = !!packagedInto
            && fs.existsSync(path.join(packagedInto, 'public', 'index.html'))
            && fs.existsSync(path.join(packagedInto, 'package.json'));

        const cwd = String(input?.cwd || '').trim()
            || (packagedIsWhole ? packagedInto : '')
            || (activeProj?.dir && fs.existsSync(activeProj.dir) ? String(activeProj.dir) : '')
            || workspaceService.getActiveRoot(context?.workspaceId);
        if (!input?.cwd && packagedIsWhole) {
            say(pick(isAr,
                `📦 الواجهة محزومة داخل الخادم — أُشغّل النظام كاملاً (${path.basename(packagedInto)}) لا مجلّد الشيفرة.`,
                `📦 The interface is packaged inside the server — starting the whole system (${path.basename(packagedInto)}), not the source folder.`));
        }
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
            ? { command: String(input.command), kind: 'override', expectPort: port, forced: false }
            : detectStart(cwd, port);
        say(pick(isAr,
            `▶️ أُشغّل المشروع (${detected.kind}) على المنفذ ${port}…`,
            `▶️ Starting the project (${detected.kind}) on port ${port}…`));

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

        /**
          * Readiness — and the trap in «discover where it bound».
          *
          * Probing the common framework ports was written to find a server
          * that drifted. But a drifted server is indistinguishable from
          * SOMEONE ELSE'S: his «Port 5173 is in use» was a Vite from an
          * earlier run that nobody stopped, and a probe of 5173 would have
          * reported that orphan as «the project is running» and opened its
          * stale interface as the new one.
          *
          * So the search is only allowed where the port was a hope. When we
          * FORCED it — a flag the framework must obey, or a static server we
          * point ourselves — the answer is that port or nothing.
          */
        const probeList = detected.forced ? [port] : [port, ...COMMON_DEV_PORTS.filter(p => p !== port)];
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
            /**
             * AND WHEN NOTHING ANSWERED, SAY SO — DO NOT HAND OVER AN ADDRESS.
             *
             * This used to return `url: http://localhost:${port}/` for a port
             * that had just been probed for 45 seconds and found dead. That
             * link went into the delivery report and into his browser, and
             * came back «ERR_CONNECTION_REFUSED» — Joe inventing an address
             * for a server he had failed to confirm.
             *
             * A URL is a promise that something is there. With no `url`, the
             * pipeline's `if (runRes.output?.url)` leaves the report silent
             * about a live link instead of advertising a dead one, and he
             * gets the command to run it himself.
             */
            say(pick(isAr,
                `⏳ بدأ الخادم لكنه لم يستجب على أي منفذ خلال ٤٥ ثانية — لن أعطيك رابطاً لم أتحقّق منه. شغّله بنفسك: «${detected.command}» داخل ${cwd}`,
                `⏳ The server started but answered on no port within 45s — I will not hand you a link I could not confirm. Run it yourself: «${detected.command}» in ${cwd}`));
            return {
                ok: true,
                output: {
                    port, ready: false, pid, cwd, command: detected.command,
                    note: 'started_not_confirmed',
                },
                logs,
            };
        }

        const url = `http://localhost:${livePort}/`;
        say(pick(isAr,
            `✅ المشروع يعمل الآن — المعاينة الحية: ${url}`,
            `✅ The project is running — live preview: ${url}`));
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

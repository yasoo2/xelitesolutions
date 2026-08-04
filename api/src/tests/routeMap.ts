/**
 * THE HTTP CONTRACT, READ FROM THE SOURCE.
 *
 * The wiring policy applied to the last unchecked seam: a `fetch` in the web
 * app is a promise that a route exists. Booting the app and probing it proves
 * nothing — Express answers 404 for a POST-only route asked with GET, so a
 * probe cannot tell «not mounted» from «wrong verb». So the contract is read
 * where it is actually declared: the mount table in `api/app.ts` and the
 * `router.<method>('<path>')` lines in every file it mounts.
 *
 * Used by the standing Jest lock and by the manual proof, so both judge the
 * same map.
 */
import fs from 'fs';
import path from 'path';

const API_SRC = path.join(__dirname, '..');
const WEB_SRC = path.join(__dirname, '..', '..', '..', 'web', 'src');

export interface ServerRoute {
    /** the full path as declared, e.g. `/api/sessions/:id/messages` */
    path: string;
    methods: string[];
    /** the file the handler lives in, for a useful failure message */
    source: string;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all', 'use'];

const join = (a: string, b: string) => (a + (b === '/' ? '' : b)).replace(/\/{2,}/g, '/') || '/';

/** `/sessions/:id/messages` → a matcher that also accepts `/sessions/x/messages`. */
export const routeRegex = (p: string) =>
    new RegExp('^' + p
        .replace(/[.+?^$()|[\]\\]/g, '\\$&')
        .replace(/:[A-Za-z0-9_]+\*?/g, '[^/]+')
        .replace(/\*+/g, '.*')
        .replace(/\/$/, '') + '/?$');

/** Every route the server really declares, resolved through the mount table. */
export function serverRoutes(): ServerRoute[] {
    const app = fs.readFileSync(path.join(API_SRC, 'api', 'app.ts'), 'utf-8');

    // import fooRoutes from './routes/foo'  →  fooRoutes ⇒ routes/foo.ts
    const files = new Map<string, string>();
    for (const m of app.matchAll(/import\s+(\w+)\s+from\s+'\.\/routes\/([\w.-]+)'/g)) {
        files.set(m[1], path.join(API_SRC, 'api', 'routes', `${m[2]}.ts`));
    }

    const out: ServerRoute[] = [];
    const seen = new Set<string>();
    const add = (p: string, methods: string[], source: string) => {
        const key = p + ' ' + methods.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ path: p, methods, source });
    };

    /** Routes declared directly on a router object inside one file. */
    const routesIn = (file: string, prefix: string, depth = 0) => {
        if (!fs.existsSync(file) || depth > 3) return;
        const src = fs.readFileSync(file, 'utf-8');
        // Only calls on a real router object count — `req.get('host')` is not a route.
        const re = new RegExp(`\\b(?:router|apiRouter)\\.(${METHODS.join('|')})\\(\\s*['\`]([^'\`]+)['\`]`, 'g');
        for (const m of src.matchAll(re)) {
            const method = m[1];
            const p = join(prefix, m[2]);
            if (method === 'use') {
                // a nested mount: find the router it mounts, if it is a local import
                const tail = src.slice(m.index || 0, (m.index || 0) + 200);
                const ref = tail.match(/,\s*(?:[\w]+\s*,\s*)*(\w+Rout\w*)\s*\)/);
                const sub = ref && files.get(ref[1]);
                if (sub) routesIn(sub, p, depth + 1);
                else add(p + '/*', ['USE'], path.basename(file));
                continue;
            }
            add(p, method === 'all' ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] : [method.toUpperCase()],
                path.basename(file));
        }
    };

    // routes declared straight on apiRouter inside app.ts
    routesIn(path.join(API_SRC, 'api', 'app.ts'), '/api');

    // apiRouter.use('/prefix', [middleware,] fooRoutes)
    for (const m of app.matchAll(/apiRouter\.use\(\s*'([^']+)'\s*,\s*([^)]+)\)/g)) {
        const ref = [...m[2].matchAll(/(\w+)/g)].map(x => x[1]).reverse().find(n => files.has(n));
        if (ref) routesIn(files.get(ref)!, join('/api', m[1]));
    }
    // app.use('/prefix', fooRoutes) — anything mounted outside the /api router
    for (const m of app.matchAll(/\bapp\.use\(\s*'([^']+)'\s*,\s*([^)]+)\)/g)) {
        const ref = [...m[2].matchAll(/(\w+)/g)].map(x => x[1]).reverse().find(n => files.has(n));
        if (ref) routesIn(files.get(ref)!, m[1]);
    }
    return out;
}

/** Every `${API}/…` URL the web app calls, template holes turned into ids. */
export function uiPaths(): Array<{ path: string; file: string }> {
    const read = (dir: string): Array<{ file: string; body: string }> =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
            e.isDirectory() ? read(path.join(dir, e.name))
                : /\.(ts|tsx)$/.test(e.name)
                    ? [{ file: e.name, body: fs.readFileSync(path.join(dir, e.name), 'utf-8') }]
                    : []);
    const found = new Map<string, string>();
    for (const { file, body } of read(WEB_SRC)) {
        for (const m of body.matchAll(/\$\{[A-Za-z_]*(?:API|BASE)[A-Za-z_]*\}(\/[a-zA-Z0-9/_.:$%{}()-]*)/g)) {
            const p = '/api' + m[1]
                .replace(/\$\{[^}]*\}/g, 'x')
                .replace(/\?.*$/, '')
                .replace(/\/+$/, '');
            if (!p || p.includes('..') || p === '/api') continue;
            if (!found.has(p)) found.set(p, file);
        }
    }
    return [...found].map(([p, file]) => ({ path: p, file })).sort((a, b) => a.path.localeCompare(b.path));
}

/** UI paths with no route behind them — the buttons that can never work. */
export function unreachableUiPaths(): Array<{ path: string; file: string }> {
    const routes = serverRoutes().map(r => ({ ...r, re: routeRegex(r.path) }));
    return uiPaths().filter(u => !routes.some(r => r.re.test(u.path)));
}

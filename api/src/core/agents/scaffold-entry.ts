/**
 *  A SCAFFOLD THAT CANNOT BE BUILT IS NOT A SCAFFOLD.
 *
 *  Measured live, sixteen minutes into a real run on his machine. The
 *  pipeline scaffolded `employee-salary-dashboard`, executed three phases,
 *  and died in the fourth:
 *
 *      Failed phase: Final Testing and Deployment
 *      error during build:
 *      Could not resolve entry module "index.html".
 *
 *  The project on disk was: docs, node_modules, package.json, src,
 *  vite.config.js — and no index.html. Vite cannot build without it, and
 *  nothing between the scaffold and the last phase ever asked whether it
 *  was there. `scaffoldProject` writes whatever structure the planner
 *  hands it, and the planner had not written the one file the toolchain
 *  requires.
 *
 *  A check here costs a millisecond. Learning it from a rollup stack trace
 *  costs the whole run — and cost him the sixteen minutes he sat watching
 *  it.
 *
 *  IT REPAIRS ONLY WHEN THE ANSWER IS DETERMINATE. Exactly one module
 *  under `src/` that looks like an entry means there is exactly one
 *  correct index.html, and writing it is completing a scaffold rather than
 *  guessing at one. Zero modules, or several, means guessing — so it
 *  refuses and names what is missing. A truthful failure at the scaffold
 *  beats a mysterious one at the end.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface EntryPointCheck {
    /** True when the project cannot be built and this file would not guess. */
    missing: boolean;
    /** Why, in a sentence the repair ticket can act on. Empty when fine. */
    reason: string;
    /** The file this completed, when it completed one. Empty otherwise. */
    wrote: string;
}

const ENTRY_MODULES = ['main.jsx', 'main.tsx', 'main.js', 'main.ts', 'index.jsx', 'index.tsx'];

export function completeTheEntryPoint(targetDir: string): EntryPointCheck {
    const at = (f: string) => path.join(targetDir, f);
    const has = (f: string) => { try { return fs.existsSync(at(f)); } catch { return false; } };
    const ok: EntryPointCheck = { missing: false, reason: '', wrote: '' };

    //  Only a toolchain that needs an HTML entry is judged here. A Node
    //  service or a library has no index.html and must not be failed for it.
    const viteConfig = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].find(has);
    let buildsWithVite = !!viteConfig;
    try {
        const pkg = JSON.parse(fs.readFileSync(at('package.json'), 'utf-8'));
        const scripts = Object.values(pkg?.scripts || {}).join(' ');
        if (/(?:^|[^a-z])vite(?:$|[^a-z])/i.test(scripts)) buildsWithVite = true;
    } catch { /* a missing or broken manifest is a different fault, reported elsewhere */ }

    if (!buildsWithVite || has('index.html')) return ok;

    //  An explicit entry in the config is the author's own answer, and it
    //  outranks anything this file would infer.
    try {
        if (viteConfig && /rollupOptions[\s\S]{0,240}input/.test(fs.readFileSync(at(viteConfig), 'utf-8'))) {
            return ok;
        }
    } catch { /* an unreadable config falls through to the check below */ }

    const candidates = ENTRY_MODULES
        .filter(f => has(path.join('src', f)))
        .map(f => 'src/' + f);

    if (candidates.length !== 1) {
        return {
            missing: true,
            wrote: '',
            reason: 'scaffold_incomplete: the project builds with Vite and has no index.html, and '
                + (candidates.length === 0
                    ? 'no single entry module under src/ to point one at'
                    : 'there are ' + candidates.length + ' possible entry modules (' + candidates.join(', ') + '), so the entry is ambiguous')
                + '. Add index.html to the project structure, or declare build.rollupOptions.input in the Vite config.',
        };
    }

    const title = path.basename(targetDir).replace(/[-_]+/g, ' ').trim() || 'App';
    const lines = [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '    <title>' + title + '</title>',
        '  </head>',
        '  <body>',
        '    <div id="root"></div>',
        '    <script type="module" src="/' + candidates[0] + '"></script>',
        '  </body>',
        '</html>',
        '',
    ];
    fs.writeFileSync(at('index.html'), lines.join('\n'), 'utf-8');
    return { missing: false, reason: '', wrote: 'index.html' };
}

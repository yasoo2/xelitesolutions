/**
 * MONACO COMES FROM THE MACHINE, NOT FROM THE INTERNET — AND NOT AT BOOT.
 *
 * `@monaco-editor/react` loads the editor from a CDN by default. Joe runs
 * LOCALLY — on a laptop, often offline, sometimes behind a filtered network —
 * so the editor simply never mounted and the «<>» view showed nothing at all.
 * Reported from the field as «الرمز الذي بجنبه لا يعمل ابدا», and «ابدا» was
 * literally true: with no CDN there was never an editor to show. Pointing the
 * loader at the bundled copy removed the network from that path.
 *
 * It also moved the whole editor into the ENTRY chunk, because main.tsx
 * imported this file eagerly. Measured on a real build: index-*.js weighed
 * 3.79 MB and 560 of its identifiers were Monaco's, which is why vite kept
 * printing «(!) Some chunks are larger than 2000 kB after minification».
 * Raising the warning limit would have silenced the counter, not the cost —
 * on a domain that is several megabytes downloaded before anything appears.
 *
 * So the editor is fetched the first time a code view actually opens, once.
 * Every consumer waits for this before mounting an <Editor>: mounting one
 * BEFORE the loader is configured is exactly what sends it back to the CDN.
 */
import { useEffect, useState } from 'react';
// Statically imported ON PURPOSE. Importing this wrapper dynamically while
// PreviewPanel and DiffViewer import it normally made vite warn on every build:
// «dynamically imported … but also statically imported … dynamic import will
// not move module into another chunk». It is 16 kB — the weight was never here.
import { loader } from '@monaco-editor/react';

let ready: Promise<void> | null = null;

export function ensureMonaco(): Promise<void> {
    if (ready) return ready;
    ready = (async () => {
        /**
         * `monaco-editor` pulls EVERY language it knows: 3.8 MB of editor plus
         * a 7 MB TypeScript worker, a 1 MB CSS worker and a hundred tiny
         * language chunks that filled the build log. This is a READ-ONLY
         * VIEWER — it colours code, it does not diagnose it.
         *
         * So: the editor core, and the handful of languages a Joe project
         * actually contains. No language services, therefore no workers, and a
         * build log a human can read.
         */
        const monaco: any = await import('monaco-editor/esm/vs/editor/editor.api');
        await Promise.all([
            import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'),
            import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'),
            import('monaco-editor/esm/vs/basic-languages/css/css.contribution'),
            import('monaco-editor/esm/vs/basic-languages/scss/scss.contribution'),
            import('monaco-editor/esm/vs/basic-languages/html/html.contribution'),
            import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'),
            import('monaco-editor/esm/vs/basic-languages/python/python.contribution'),
            import('monaco-editor/esm/vs/basic-languages/shell/shell.contribution'),
            import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'),
            import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution'),
        ]);
        // JSON has no basic-language contribution; its tokeniser lives in the
        // language service, which we deliberately do not ship. Monaco falls
        // back to plain text for it, which a viewer survives.
        const worker: any = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
        const EditorWorker: any = worker.default;
        (self as any).MonacoEnvironment = { getWorker() { return new EditorWorker(); } };
        (loader as any).config({ monaco });
    })();
    return ready;
}

/** So a component can simply not render the editor until it is safe to. */
export function useMonacoReady(active = true): boolean {
    const [ok, setOk] = useState(false);
    useEffect(() => {
        if (!active || ok) return;
        let alive = true;
        // A failure must not hide the panel forever: let Monaco show its own
        // loading/error state rather than leaving a blank screen behind a flag.
        ensureMonaco()
            .catch(() => { /* unbundled and offline — Monaco reports it itself */ })
            .finally(() => { if (alive) setOk(true); });
        return () => { alive = false; };
    }, [active, ok]);
    return ok;
}

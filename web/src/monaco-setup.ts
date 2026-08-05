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

let ready: Promise<void> | null = null;

export function ensureMonaco(): Promise<void> {
    if (ready) return ready;
    ready = (async () => {
        const [monaco, { loader }, worker] = await Promise.all([
            import('monaco-editor'),
            import('@monaco-editor/react'),
            import('monaco-editor/esm/vs/editor/editor.worker?worker'),
        ]);
        // The base worker is enough for a read-only viewer: tokenisation and
        // folding. Without it Monaco still renders, but complains on every mount.
        const EditorWorker: any = (worker as any).default;
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

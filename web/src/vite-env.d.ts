/// <reference types="vite/client" />

/**
 * Monaco's deep ESM entry points.
 *
 * The package exposes them (`"./*"`), and vite resolves them perfectly — but
 * TypeScript, under this project's module resolution, refuses a subpath whose
 * types it cannot map. Importing them is how the code view ships an EDITOR
 * instead of the whole 3.8 MB IDE with every language service in it, so the
 * shapes are declared here rather than the imports abandoned.
 */
declare module 'monaco-editor/esm/vs/editor/editor.api' {
    const monaco: any;
    export = monaco;
}
declare module 'monaco-editor/esm/vs/basic-languages/*' {
    const contribution: any;
    export default contribution;
}
declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
    const Worker: { new(): globalThis.Worker };
    export default Worker;
}
declare module 'monaco-editor/esm/vs/editor/edcore.main' {
    const monaco: any;
    export = monaco;
}

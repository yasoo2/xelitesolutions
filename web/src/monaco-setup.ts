/**
 * MONACO COMES FROM THE MACHINE, NOT FROM THE INTERNET.
 *
 * `@monaco-editor/react` loads the editor from a CDN by default. Joe runs
 * LOCALLY — on a laptop, often offline, sometimes behind a filtered network —
 * so the editor simply never mounted and the «<>» view showed nothing at all.
 * Reported from the field as «الرمز الذي بجنبه لا يعمل ابدا», and «ابدا» was
 * literally true: with no CDN there was never an editor to show.
 *
 * `monaco-editor` is already a dependency of this app. Pointing the loader at
 * the bundled copy removes the network from the path entirely.
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// The base worker is enough for a read-only viewer: tokenisation and folding.
// Without it Monaco still renders, but it complains on every mount.
(self as any).MonacoEnvironment = {
    getWorker() { return new editorWorker(); },
};

loader.config({ monaco });

export { };

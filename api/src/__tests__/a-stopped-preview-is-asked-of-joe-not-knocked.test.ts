/**
 * A STOPPED PREVIEW IS ASKED OF JOE, NOT KNOCKED ON (session-preview.ts previewAddressAnswers).
 *
 * The ladder's UI/UX check of Joe's own page, 2026-11-09 (L151–L160): half the
 * prompts ended with «console_errors — ERR_CONNECTION_REFUSED @ 127.0.0.1:4300»:
 * the Preview tab knocked on the stopped project server from the browser every
 * 15 s. Pinned: Joe's server answers for an address on its own machine (its
 * loopback, or the host he reached Joe at) on a project's port; any other host
 * and the system ports are not Joe's to probe; and the Preview tab asks Joe.
 */
import fs from 'fs';
import path from 'path';
import { previewAddressAnswers } from '../api/session-preview';

const open4300 = async (port: number) => port === 4300;

test('an address on this machine is answered: alive or stopped', async () => {
    expect(await previewAddressAnswers('http://127.0.0.1:4300/', '', open4300)).toBe(true);
    expect(await previewAddressAnswers('http://localhost:4301/', '', open4300)).toBe(false);
    expect(await previewAddressAnswers('http://[::1]:4300/x', '', open4300)).toBe(true);
    //  The Preview tab rewrites 127.0.0.1 to the host he opened Joe at.
    expect(await previewAddressAnswers('http://192.168.1.20:4300/', '192.168.1.20', open4300)).toBe(true);
});

test('another host, a system port, or not an address is not Joe\'s to probe', async () => {
    const asked: number[] = [];
    const spy = async (p: number) => { asked.push(p); return true; };
    expect(await previewAddressAnswers('http://example.com:4300/', '192.168.1.20', spy)).toBeNull();
    expect(await previewAddressAnswers('http://10.0.0.5:4300/', '192.168.1.20', spy)).toBeNull();
    expect(await previewAddressAnswers('http://127.0.0.1:22/', '', spy)).toBeNull();
    expect(await previewAddressAnswers('http://127.0.0.1/', '', spy)).toBeNull();
    expect(await previewAddressAnswers('file:///C:/x', '', spy)).toBeNull();
    expect(await previewAddressAnswers('http://u:p@127.0.0.1:4300/', '', spy)).toBeNull();
    expect(await previewAddressAnswers('not a url', '', spy)).toBeNull();
    expect(asked).toEqual([]);
});

test('the Preview tab asks Joe, and the route needs the owner of the conversation', () => {
    const panel = fs.readFileSync(path.resolve(__dirname, '../../../web/src/components/PreviewPanel.tsx'), 'utf8');
    expect(panel).toMatch(/\/preview-alive`/);
    const routes = fs.readFileSync(path.resolve(__dirname, '../api/routes/sessions.ts'), 'utf8');
    expect(routes).toMatch(/get\('\/:id\/preview-alive', authenticate/);
    const controller = fs.readFileSync(path.resolve(__dirname, '../api/controllers/sessionController.ts'), 'utf8');
    expect(controller).toMatch(/sessionPreviewAlive[\s\S]{0,400}requireOwnedSession/);
});

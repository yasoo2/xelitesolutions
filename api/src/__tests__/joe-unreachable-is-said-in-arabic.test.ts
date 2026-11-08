/**
 * «JOE DID NOT ANSWER» IS SAID IN THE READER'S LANGUAGE.
 *
 * The owner, 2026-11-09, connecting a local model while Joe restarted, read
 * «Failed to fetch» in red: the browser's own English for a request that
 * reached no server. It is told now as that — Joe cannot be reached now, wait
 * and try again — in six languages.
 */
import fs from 'fs';
import path from 'path';
import { isNetworkFailure } from '../../../web/src/lib/network-error';

test('the browsers\' words for «no server answered» are known as such', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isNetworkFailure(new TypeError('Load failed'))).toBe(true);
    expect(isNetworkFailure(new Error('invalid x-api-key'))).toBe(false);
    expect(isNetworkFailure(new TypeError('Cannot read properties of undefined'))).toBe(false);
});

test('the connect button says it in his language, never the browser\'s English', () => {
    const web = path.join(__dirname, '..', '..', '..', 'web', 'src');
    const composer = fs.readFileSync(path.join(web, 'components', 'CommandComposer.tsx'), 'utf8');
    expect(composer).toContain("isNetworkFailure(err) ? t('cc_joeUnreachable')");
    const i18n = fs.readFileSync(path.join(web, 'i18n.ts'), 'utf8');
    expect((i18n.match(/cc_joeUnreachable:/gu) || []).length).toBe(6);
    expect(i18n).toContain('تعذّر الوصول إلى جو الآن');
});

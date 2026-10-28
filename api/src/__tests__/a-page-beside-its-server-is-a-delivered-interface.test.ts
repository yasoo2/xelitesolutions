import fs from 'fs';
import os from 'os';
import path from 'path';
import { deliveredPageDirectory, projectAuditDirectory } from '../modules/tools/definitions/ProjectPipelineTool';

/**
 * P001 (run-1793001129856): a dental-clinic landing page was written to
 * src/index.html beside src/server.js, the server was live on :4301, and the
 * run still failed «the request asks for an interface, but no delivered part
 * serves one (no index.html)» — only the root, dist/ and public/ were looked
 * at. Browser QA never opened the page, so the real defect (the server sent
 * src/src/index.html) was never measured nor repaired. The page is found
 * wherever the build put it; folders that hold no delivered page stay out.
 */
describe('a page beside its server is a delivered interface', () => {
    let tmp = '';
    const write = (rel: string, text = '<!doctype html><title>x</title>') => {
        const file = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text, 'utf8');
    };
    beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-delivered-page-')); });
    afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

    test('P001 shape: src/index.html served by src/server.js is found', () => {
        write('package.json', JSON.stringify({ main: 'src/server.js' }));
        write('src/server.js', '// express');
        write('src/index.html');
        expect(deliveredPageDirectory(tmp)).toBe(path.join(tmp, 'src'));
        expect(projectAuditDirectory([tmp])).toBe(path.join(tmp, 'src'));
    });

    test('a page in client/www/static folders is found, the shallowest first', () => {
        write('client/app/index.html');
        write('www/index.html');
        expect(deliveredPageDirectory(tmp)).toBe(path.join(tmp, 'www'));
    });

    test('the usual places still win over any nested page', () => {
        write('src/index.html');
        write('public/index.html');
        expect(deliveredPageDirectory(tmp)).toBe(path.join(tmp, 'public'));
        write('index.html');
        expect(deliveredPageDirectory(tmp)).toBe(tmp);
    });

    test('installed packages, hidden folders, coverage reports and tests are not a delivered page', () => {
        write('server.js', '// API only');
        write('node_modules/some-pkg/index.html');
        write('coverage/lcov-report/index.html');
        write('.cache/index.html');
        write('tests/fixtures/index.html');
        write('__tests__/index.html');
        // Reports a test or coverage run leaves behind (round 21 review).
        write('htmlcov/index.html');
        write('playwright-report/index.html');
        write('test-results/index.html');
        write('storybook-static/index.html');
        expect(deliveredPageDirectory(tmp)).toBe('');
        expect(projectAuditDirectory([tmp])).toBe(tmp);
    });

    test('across parts, a part\'s usual place outranks a page found by searching another', () => {
        const api = path.join(tmp, 'api-shop');
        const react = path.join(tmp, 'react-shop');
        write('api-shop/src/views/index.html');
        write('react-shop/public/index.html');
        expect(projectAuditDirectory([api, react])).toBe(path.join(react, 'public'));
    });

    test('a page found only by searching the tree counts where the request asks for an interface', () => {
        const src = fs.readFileSync(path.join(__dirname, '../modules/tools/definitions/ProjectPipelineTool.ts'), 'utf8');
        expect(src).toMatch(/\|\| \(deliveryRoles\.interface && interfaceRoots\.some\(root => !!deliveredPageDirectory\(root\)\)\);/);
    });
});

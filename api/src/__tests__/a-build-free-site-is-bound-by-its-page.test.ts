/**
 * A BUILD-FREE SITE IS BOUND AS THE PROJECT BY ITS PAGE.
 *
 * Measured on P001 (run-1793133495009, «اعمل موقع تعريفي احترافي لـعيادة
 * أسنان…»): the plan built a plain HTML/CSS/JS site — phase 1 wrote
 * clinic-landing-ar/index.html and clinic-landing-ar/styles.css, no
 * package.json, no server. projectRootFromWrittenFile accepted only a manifest
 * or a server-shaped entrypoint as identity evidence, so the project was never
 * bound («refused to synchronize active project root» after every write, no
 * «runtime project evidence bound»). With no session project, browser_run's
 * loopback preview (startLocalSitePreview) has no folder to serve and the QA
 * phase ends «no_target_for_this_instruction».
 *
 * THE CLASS: every site written file by file without a manifest. The page
 * (index.html at the child's root or in src/, the folders staticSiteRoot
 * serves) is now identity evidence under the same guards as a server entry:
 * a direct child of the workspace whose name matches the project.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { projectRootFromWrittenFile } from '../modules/tools/definitions/PhaseExecutorTool';
import { staticSiteRoot } from '../modules/tools/preview-site';

describe('a build-free site is bound as the project by its page', () => {
    let tmp: string;
    let site: string;

    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-site-binding-'));
        site = path.join(tmp, 'clinic-landing-ar');
        fs.mkdirSync(path.join(site, 'src'), { recursive: true });
        fs.mkdirSync(path.join(site, 'pages'), { recursive: true });
        fs.writeFileSync(path.join(site, 'index.html'), '<!DOCTYPE html><html lang="ar" dir="rtl"><head><link rel="stylesheet" href="styles.css"></head><body><h1>عيادة</h1></body></html>');
        fs.writeFileSync(path.join(site, 'src', 'index.html'), '<!DOCTYPE html><html><body></body></html>');
        fs.writeFileSync(path.join(site, 'pages', 'index.html'), '<!DOCTYPE html><html><body></body></html>');
        fs.writeFileSync(path.join(site, 'styles.css'), 'body{margin:0}');
    });

    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('binds the named child from its index.html, with no manifest, and that root is servable', () => {
        expect(fs.existsSync(path.join(site, 'package.json'))).toBe(false);
        const root = projectRootFromWrittenFile('clinic-landing-ar/index.html', tmp, 'clinic-landing-ar');
        expect(root).toBe(site);
        expect(staticSiteRoot(root, { servedAtRoot: true })).toBeTruthy();
    });

    it('binds from src/index.html too, the other folder a static site is served from', () => {
        expect(projectRootFromWrittenFile('clinic-landing-ar/src/index.html', tmp, 'clinic-landing-ar')).toBe(site);
    });

    it('keeps the guards: no other file, no deeper page, no unmatched folder', () => {
        expect(projectRootFromWrittenFile('clinic-landing-ar/styles.css', tmp, 'clinic-landing-ar')).toBe('');
        expect(projectRootFromWrittenFile('clinic-landing-ar/pages/index.html', tmp, 'clinic-landing-ar')).toBe('');
        expect(projectRootFromWrittenFile('clinic-landing-ar/index.html', tmp, 'weather dashboard')).toBe('');
        expect(projectRootFromWrittenFile('index.html', tmp, 'clinic-landing-ar')).toBe('');
    });
});

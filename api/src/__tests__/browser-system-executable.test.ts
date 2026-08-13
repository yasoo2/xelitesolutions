import fs from 'fs';
import { findChromiumExecutable } from '../modules/browser/manager';

describe('system Chromium fallback', () => {
    const previousBrowserPath = process.env.BROWSER_EXECUTABLE_PATH;
    const previousChromiumPath = process.env.CHROMIUM_PATH;
    const previousPlaywrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH;

    beforeEach(() => {
        delete process.env.BROWSER_EXECUTABLE_PATH;
        delete process.env.CHROMIUM_PATH;
        delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    });

    afterEach(() => {
        if (previousBrowserPath === undefined) delete process.env.BROWSER_EXECUTABLE_PATH;
        else process.env.BROWSER_EXECUTABLE_PATH = previousBrowserPath;
        if (previousChromiumPath === undefined) delete process.env.CHROMIUM_PATH;
        else process.env.CHROMIUM_PATH = previousChromiumPath;
        if (previousPlaywrightPath === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
        else process.env.PLAYWRIGHT_BROWSERS_PATH = previousPlaywrightPath;
        jest.restoreAllMocks();
    });

    it('uses an installed system Chromium when Playwright has no executable', () => {
        const exists = jest.spyOn(fs, 'existsSync').mockImplementation((candidate: fs.PathLike) => (
            String(candidate) === '/usr/bin/chromium'
        ));

        expect(findChromiumExecutable()).toBe('/usr/bin/chromium');
        expect(exists).toHaveBeenCalledWith('/usr/bin/chromium');
    });

    it('keeps an explicit executable path above system-browser discovery', () => {
        process.env.BROWSER_EXECUTABLE_PATH = '/custom/joe-chromium';
        jest.spyOn(fs, 'existsSync').mockImplementation((candidate: fs.PathLike) => (
            String(candidate) === '/custom/joe-chromium' || String(candidate) === '/usr/bin/chromium'
        ));

        expect(findChromiumExecutable()).toBe('/custom/joe-chromium');
    });
});

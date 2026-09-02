import fs from 'fs';
import { findChromiumExecutable } from '../modules/browser/manager';

describe('system Chromium fallback', () => {
    const previousBrowserPath = process.env.BROWSER_EXECUTABLE_PATH;
    const previousChromiumPath = process.env.CHROMIUM_PATH;
    const previousPlaywrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const previousSystemChrome = process.env.USE_SYSTEM_CHROME;

    beforeEach(() => {
        delete process.env.BROWSER_EXECUTABLE_PATH;
        delete process.env.CHROMIUM_PATH;
        delete process.env.PLAYWRIGHT_BROWSERS_PATH;
        delete process.env.USE_SYSTEM_CHROME;
    });

    afterEach(() => {
        if (previousBrowserPath === undefined) delete process.env.BROWSER_EXECUTABLE_PATH;
        else process.env.BROWSER_EXECUTABLE_PATH = previousBrowserPath;
        if (previousChromiumPath === undefined) delete process.env.CHROMIUM_PATH;
        else process.env.CHROMIUM_PATH = previousChromiumPath;
        if (previousPlaywrightPath === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
        else process.env.PLAYWRIGHT_BROWSERS_PATH = previousPlaywrightPath;
        if (previousSystemChrome === undefined) delete process.env.USE_SYSTEM_CHROME;
        else process.env.USE_SYSTEM_CHROME = previousSystemChrome;
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

    it('does not fall back to the user system browser when isolation is pinned', () => {
        process.env.USE_SYSTEM_CHROME = '0';
        const exists = jest.spyOn(fs, 'existsSync').mockImplementation((candidate: fs.PathLike) => (
            String(candidate) === '/usr/bin/chromium'
        ));

        expect(findChromiumExecutable()).toBeUndefined();
        expect(exists).not.toHaveBeenCalledWith('/usr/bin/chromium');
    });
});

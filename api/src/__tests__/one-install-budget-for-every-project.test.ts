import fs from 'fs';
import path from 'path';
import { NETWORK_INSTALL_TIMEOUTS } from '../shared/network-install-timeouts';
import { REACT_NETWORK_INSTALL_TIMEOUTS } from '../modules/tools/definitions/ReactProjectTool';

/**
 * Eval run500 P001, 2026-10-23: the API tool capped a whole cold `npm install`
 * at 30 s and reported «The API dependencies were not installed», while the
 * React tool already used a measured 15 min / 5 min-idle budget for the same
 * job. One budget for every project install.
 */
describe('one install budget for every project Joe builds', () => {
    it('the React tool uses the shared budget', () => {
        expect(REACT_NETWORK_INSTALL_TIMEOUTS).toBe(NETWORK_INSTALL_TIMEOUTS);
        expect(NETWORK_INSTALL_TIMEOUTS.absoluteMs).toBeGreaterThanOrEqual(5 * 60_000);
        expect(NETWORK_INSTALL_TIMEOUTS.idleMs).toBeGreaterThanOrEqual(124_000);
    });

    it('the API tool installs with the shared budget, not a 30 s cut', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ApiProjectTool.ts'), 'utf8');
        const install = src.slice(src.indexOf("const instRun = await shell.run('npm', ["), src.indexOf('const inst = instRun.missing'));
        expect(install).toContain('timeout: NETWORK_INSTALL_TIMEOUTS.absoluteMs');
        expect(install).toContain('idleTimeout: NETWORK_INSTALL_TIMEOUTS.idleMs');
        expect(install).not.toMatch(/timeout:\s*30_000/);
    });
});

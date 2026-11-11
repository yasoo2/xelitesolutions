/**
 * A reload opens the conversation the user was reading, not the newest one.
 * Measured on 2026-11-05: with «joe-active-session» set to a finished Arabic
 * session, the page opened the newest (running) one every time.
 */
import fs from 'fs';
import path from 'path';
import { chooseActiveSession } from '../../../web/src/lib/session-selection';

const WEB = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', ...p), 'utf8');
const agents = ['6aeccfc1b88236986fce9f90', '6aec83beafe962f66a5e05d0', '6aec316973ab41dbc69cb5a0'];

describe('a reload stays on the conversation you were reading', () => {
    it('defaults to the saved conversation when nothing is open yet', () => {
        expect(chooseActiveSession({ chatIds: [], agentIds: agents, selected: null, agentSelected: null, preferred: '6aec316973ab41dbc69cb5a0' }))
            .toEqual({ selected: null, agentSelected: '6aec316973ab41dbc69cb5a0' });
    });

    it('a saved chat conversation is opened as a chat', () => {
        expect(chooseActiveSession({ chatIds: ['c1'], agentIds: agents, selected: null, agentSelected: null, preferred: 'c1' }))
            .toEqual({ selected: 'c1', agentSelected: null });
    });

    it('falls back to the newest only when the saved one is gone', () => {
        expect(chooseActiveSession({ chatIds: [], agentIds: agents, selected: null, agentSelected: null, preferred: 'deleted' }).agentSelected).toBe(agents[0]);
        expect(chooseActiveSession({ chatIds: [], agentIds: agents, selected: null, agentSelected: null }).agentSelected).toBe(agents[0]);
    });

    it('keeps what the user has open, and never both kinds at once', () => {
        expect(chooseActiveSession({ chatIds: ['c1'], agentIds: agents, selected: null, agentSelected: agents[1], preferred: agents[2] }).agentSelected).toBe(agents[1]);
        expect(chooseActiveSession({ chatIds: ['c1'], agentIds: agents, selected: 'c1', agentSelected: agents[1] })).toEqual({ selected: 'c1', agentSelected: null });
    });

    it('the store uses it, with the id saved before the first render', () => {
        const store = WEB('store', 'sessionStore.ts');
        expect(store).toMatch(/chooseActiveSession\(\{[\s\S]{0,260}preferred:\s*savedAtBoot/);
        expect(store).not.toMatch(/if \(agentSessions\[0\]\) agentSelected = agentSessions\[0\]\.id;/);
    });

    it('the page reads the saved id before the list loads, not after its own effect may have overwritten it', () => {
        const joe = WEB('pages', 'Joe.tsx');
        const init = joe.slice(joe.indexOf('// Load sessions; if there are none yet'), joe.indexOf('const initGithub'));
        expect(init.indexOf('const savedId')).toBeGreaterThan(-1);
        expect(init.indexOf('const savedId')).toBeLessThan(init.indexOf('loadAllSessions()'));
    });
});

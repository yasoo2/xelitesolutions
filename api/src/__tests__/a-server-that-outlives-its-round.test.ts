/**
 *  A SERVER THAT OUTLIVES THE ROUND THAT STARTED IT.
 *
 *  Counted on the owner's machine after a day of live rounds:
 *
 *      orphan vite servers still running:   9
 *      listening 4xxx ports:               21
 *
 *  Every preview Joe opens stays open. stopServer cannot reach any of them,
 *  because it reads RUNNING — a Map in memory, emptied by every restart —
 *  while the servers themselves survive it.
 *
 *  The record does survive: joeProjects keeps live.pid and live.cwd on disk,
 *  and canAdoptRecordedLive already knows how to check that a pid is alive
 *  AND belongs to that directory. The knowledge was there; only the
 *  retirement was missing.
 */
import fs from 'fs';
import path from 'path';

const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'), 'utf-8');


//  The function's OWN body, not a fixed window: a slice that runs past the
//  closing brace reads the next function and fails on its words. Measured —
//  a 1400-character window reached stopServer and found RUNNING.get there.
const bodyOf = (name: string): string => {
    const at = SOURCE.indexOf(name);
    if (at < 0) return '';
    const open = SOURCE.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < SOURCE.length; i += 1) {
        if (SOURCE[i] === '{') depth += 1;
        else if (SOURCE[i] === '}') { depth -= 1; if (depth === 0) return SOURCE.slice(at, i + 1); }
    }
    return SOURCE.slice(at);
};

describe('the previous server is retired before a new one is born', () => {
    it('a retirement exists and runs before the launch', () => {
        const retire = SOURCE.indexOf('await retireRecordedServer(context, cwd, logs);');
        const launch = SOURCE.indexOf('const res = await ExecutionGateway.execute(detected.command');
        expect(retire).toBeGreaterThan(0);
        expect(launch).toBeGreaterThan(0);
        expect(retire).toBeLessThan(launch);
    });

    it('it reads the record that survives a restart, not the map that does not', () => {
        //  RUNNING is emptied by every restart; joeProjects is on disk. A
        //  retirement that consulted the Map could never reach an orphan.
        const body = bodyOf('async function retireRecordedServer');
        expect(body).toContain('readJoeProjectForRun');
        expect(body).not.toContain('RUNNING.get');
    });

    it('it refuses to kill anything it has not identified', () => {
        //  The negative that matters most: a pid that is not alive, or is
        //  alive but belongs to another directory, must be left alone. Killing
        //  by port or by name would end a process that was never ours.
        const body = bodyOf('async function retireRecordedServer');
        expect(body).toContain('canAdoptRecordedLive(live, cwd)');
        expect(body).toMatch(/if \(!canAdoptRecordedLive\(live, cwd\)\) return;/);
        expect(body).not.toMatch(/taskkill[^`]*\/IM|pkill|killall/);
    });

    it('a server that will not die does not stop the new one from starting', () => {
        const body = bodyOf('async function retireRecordedServer');
        expect(body).toContain('retire_failed');
    });
});

describe('there is one way to end a server, wherever the pid came from', () => {
    it('both paths go through killTree', () => {
        //  Two killers drift the first time one of them learns something the
        //  other does not — the duplication this repository keeps paying for.
        expect(SOURCE).toContain('async function killTree(pid: number)');
        const kills = SOURCE.match(/await killTree\(/g) || [];
        expect(kills.length).toBeGreaterThanOrEqual(2);
    });

    it('…and the tree is killed, not just the parent', () => {
        //  npm spawns the framework; ending npm alone leaves the server.
        const body = bodyOf('async function killTree');
        expect(body).toContain('taskkill /F /T /PID');
        expect(body).toContain('process.kill(-pid');
    });
});

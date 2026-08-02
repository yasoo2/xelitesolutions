/**
 * LIVE PROOF — the File Explorer's build location is real, changeable, and
 * PERSISTS. Three bugs the panel exposed ("system-fallback / Empty Directory"):
 *   1. getActiveRoot() with no workspace ignored a chosen folder and always
 *      returned an internal "system-fallback" dir — so picking a folder did
 *      nothing and builds landed somewhere the panel never showed.
 *   2. The choice was in-memory only, lost on every restart.
 *   3. The default was named "system-fallback" — meaningless to a user.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_workspace_location.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

async function main() {
    // Isolated projects dir so the proof never touches a real workspace.
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), `joe-proj-${Date.now()}-`));
    process.env.EXTERNAL_PROJECTS_DIR = projectsDir;

    // Fresh module instance picks up the env.
    const { WorkspaceService } = await import('../../modules/services/WorkspaceService');
    const svc1 = new (WorkspaceService as any)();

    // 1) The default has a human name, not "system-fallback".
    const def = svc1.getActiveRoot();
    const defaultIsClean = path.basename(def) === 'my-workspace' && fs.existsSync(def);

    // 2) Choosing a folder actually TAKES EFFECT (old currentRoot was ignored).
    const chosen = path.join(projectsDir, 'chosen-by-user');
    await svc1.setActiveRoot(chosen);
    const nowPointsToChosen = path.resolve(svc1.getActiveRoot()) === path.resolve(chosen);

    // A file written to the active root lands in the CHOSEN folder — the same
    // place the panel would display.
    fs.writeFileSync(path.join(svc1.getActiveRoot(), 'hello.txt'), 'hi');
    const fileLandedInChosen = fs.existsSync(path.join(chosen, 'hello.txt'));

    // 3) The choice PERSISTS across a "restart" (a brand-new service instance).
    const svc2 = new (WorkspaceService as any)();
    const persistedAfterRestart = path.resolve(svc2.getActiveRoot()) === path.resolve(chosen);

    // 4) Reset returns to the clean default, and that persists too.
    svc2.resetToSystem();
    const resetToDefault = path.basename(svc2.getActiveRoot()) === 'my-workspace';
    const svc3 = new (WorkspaceService as any)();
    const resetPersisted = path.basename(svc3.getActiveRoot()) === 'my-workspace';

    // 5) An explicit workspace id is unaffected by the local-root machinery.
    const wsRoot = svc3.getActiveRoot('64b2f0000000000000000abc');
    const wsIsolated = wsRoot.includes('64b2f0000000000000000abc');

    const checks: Array<[string, boolean]> = [
        ['default location has a human name ("my-workspace"), not "system-fallback"', defaultIsClean],
        ['choosing a folder ACTUALLY takes effect (the old bug: it was ignored)', nowPointsToChosen],
        ['a build write lands in the chosen folder — where the panel shows it', fileLandedInChosen],
        ['the choice PERSISTS across a restart (was lost in-memory before)', persistedAfterRestart],
        ['reset returns to the clean default', resetToDefault],
        ['and the reset persists across a restart', resetPersisted],
        ['an explicit workspace id stays isolated from the local root', wsIsolated],
        ['no "system-fallback" folder was ever created', !fs.existsSync(path.join(projectsDir, 'system-fallback'))],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    try { fs.rmSync(projectsDir, { recursive: true, force: true }); } catch { /* cleanup */ }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: the build location is clear, changeable, effective, and persistent.'
        : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });

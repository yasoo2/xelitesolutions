// Muse independent ownerless-joeProjects probe for TOOL-HTTP-OWNER-CANDIDATE-6965D584.
// No network, no real users/projects: synthetic temp dirs + synthetic session keys only.
// Questions:
//  1. Do writeJoeProject entries record any owner? (expected: no)
//  2. With the caller's OWN session, can image_studio reach another session's entry? (expected: no - key isolation)
//  3. Does image_studio itself compare entry ownership when NAMING another session? (expected: no check - route must gate)
//  4. Is the shared 'default' key reachable by a session-less call? (expected: yes - residual vector)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJoeProject } from 'file:///D:/Joe/muse-worktree/api/src/api/page-store.ts';
import { ImageStudioTool } from 'file:///D:/Joe/muse-worktree/api/src/modules/tools/definitions/ImageStudioTool.ts';

const mk = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const callerDir = mk('muse-probe-caller-');
const victimDir = mk('muse-probe-victim-');
const defaultDir = mk('muse-probe-default-');
fs.writeFileSync(path.join(callerDir, 'canary.txt'), 'caller', 'utf-8');
fs.writeFileSync(path.join(victimDir, 'canary.txt'), 'victim', 'utf-8');
// Victim + default dirs get a stub entities.js so entry RESOLUTION is observable:
// resolved-but-empty -> 'No table here has a picture column';
// unresolved -> 'no system with tables'.
fs.writeFileSync(path.join(victimDir, 'entities.js'), 'export const entities = { tables: {} };\n', 'utf-8');
fs.writeFileSync(path.join(defaultDir, 'entities.js'), 'export const entities = { tables: {} };\n', 'utf-8');

const g: any = global as any;
const tool = new ImageStudioTool();
const out: Record<string, unknown> = {};
try {
  const vEntry: any = writeJoeProject('sess-victim', { dir: victimDir }, 'run-v');
  const cEntry: any = writeJoeProject('sess-caller', { dir: callerDir }, 'run-c');
  out.entryKeys = { victim: Object.keys(vEntry).sort(), caller: Object.keys(cEntry).sort() };
  out.ownerless = !('owner' in vEntry) && !('userId' in vEntry) && !('owner' in cEntry) && !('userId' in cEntry);

  // 2. Own session; caller entry has no entities.js -> honest no-system error; victim untouched.
  const own = await tool.execute({}, { sessionId: 'sess-caller', userId: 'caller-1' });
  out.ownSession = { ok: own.ok, error: String(own.error || '').slice(0, 60) };
  out.victimCanary = fs.readFileSync(path.join(victimDir, 'canary.txt'), 'utf-8');
  out.strayScripts = [callerDir, victimDir].flatMap(d => fs.readdirSync(d).filter(f => f.startsWith('.joe-')));

  // 3. Naming the victim session selects the victim entry with no owner comparison.
  const named = await tool.execute({}, { sessionId: 'sess-victim', userId: 'caller-1' });
  out.namedVictim = { ok: named.ok, error: String(named.error || '').slice(0, 60) };

  // 4. Session-less call reaches the shared 'default' entry.
  delete g.joeProjects['sess-victim']; delete g.joeProjects['sess-caller'];
  writeJoeProject('default', { dir: defaultDir }, null);
  const def = await tool.execute({}, {});
  out.sessionlessDefault = { ok: def.ok, error: String(def.error || '').slice(0, 60) };
} finally {
  try { delete g.joeProjects['sess-victim']; } catch { /* probe cleanup */ }
  try { delete g.joeProjects['sess-caller']; } catch { /* probe cleanup */ }
  try { delete g.joeProjects['default']; } catch { /* probe cleanup */ }
  for (const d of [callerDir, victimDir, defaultDir]) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* probe cleanup */ }
}
console.log(JSON.stringify(out, null, 1));
// Assertions: ownerless + own-session isolation + named-session reaches (no tool-level check) + default shared.
let fail = 0;
if (!out.ownerless) fail |= 1;
if ((out.ownSession as any).ok !== false || !(out.ownSession as any).error.includes('no system with tables')) fail |= 2;
if ((out.victimCanary as any) !== 'victim' || ((out.strayScripts as any) as string[]).length !== 0) fail |= 4;
if ((out.namedVictim as any).ok !== false || !(out.namedVictim as any).error.includes('No table here has a picture column')) fail |= 8;
if ((out.sessionlessDefault as any).ok !== false || !(out.sessionlessDefault as any).error.includes('No table here has a picture column')) fail |= 16;
if (fail) { console.error('PROBE_FAIL=' + fail); process.exitCode = 2; } else console.log('PROBE_OK');

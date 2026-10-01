/* Muse wiring checkpoint 065: LEVEL3 planner-match spot-check.
 * For a sampled request battery, run capableTools(request, 8) and check whether
 * the top-k names contain at least one tool from the expected family.
 * Markers are validated against the registry first: a case whose markers match
 * zero registered tools is SETUP_INVALID, never a fail.
 * Read-only; no tools executed, no network. */
import { tools as registeredTools } from '../../api/src/modules/tools/registry';
import { capableTools } from '../../api/src/core/orchestrator/capability-match';

interface Case { id: string; request: string; markers?: string[]; expectEmpty?: boolean; observational?: boolean }

const BATTERY: Case[] = [
  { id: 'browser', request: 'Open the login page in a browser and click the Sign in button', markers: ['browser'] },
  { id: 'read', request: 'Read the file package.json and show me its contents', markers: ['read'] },
  { id: 'write', request: 'Write a hello world script to hello.js', markers: ['write'] },
  { id: 'npm-test', request: 'Run npm test and report any failures', markers: ['npm', 'test'] },
  { id: 'shell', request: 'Execute node index.js in the shell and capture the output', markers: ['shell', 'terminal'] },
  { id: 'git', request: 'Commit all changes with the message fix parser', markers: ['git'] },
  { id: 'search', request: 'Search the codebase for TODO comments', markers: ['search', 'grep'] },
  { id: 'memory', request: 'Remember that the user prefers dark mode for later', markers: ['memory'] },
  { id: 'react', request: 'Create a new React project with a data table', markers: ['react', 'project'] },
  { id: 'image-orphan', request: 'Generate an image of a sunset over mountains', markers: ['image'] },
  { id: 'negative', request: 'blorpt zzzqx fnord', expectEmpty: true },
  { id: 'chain-observational', request: 'Analyze the repository, then fix the bugs, then run the tests', observational: true },
];

const names = (registeredTools as any[]).filter((t) => t && typeof t.name === 'string').map((t) => String(t.name));
const lower = names.map((n) => n.toLowerCase());

const rows = BATTERY.map((c) => {
  const top = capableTools(c.request, 8).map((h: any) => ({ name: h.name, score: h.score, why: h.why }));
  if (c.observational) return { id: c.id, verdict: 'OBSERVED', top };
  if (c.expectEmpty) return { id: c.id, verdict: top.length === 0 ? 'PASS_DECLINED' : 'FAIL_GUESSED', top };
  const markers = (c.markers || []).map((m) => m.toLowerCase());
  const setupHits = markers.filter((m) => lower.some((n) => n.includes(m)));
  if (!setupHits.length) return { id: c.id, verdict: 'SETUP_INVALID', markers: c.markers, top };
  const hit = top.filter((h: any) => markers.some((m) => h.name.toLowerCase().includes(m)));
  return { id: c.id, verdict: hit.length ? 'HIT' : 'MISS', markers: c.markers, setupTools: names.filter((n) => markers.some((m) => n.toLowerCase().includes(m))).slice(0, 6), hitNames: hit.map((h: any) => h.name), top: top.slice(0, 4) };
});

console.log(JSON.stringify({ registered: names.length, rows }, null, 1));

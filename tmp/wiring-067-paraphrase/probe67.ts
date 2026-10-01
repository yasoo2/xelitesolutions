/* Muse wiring checkpoint 067: paraphrase robustness for the 065/066 git + memory
 * MISS families. Same harness shape as 065: capableTools(request, 8), markers
 * validated against the registry (zero-match marker => SETUP_INVALID).
 * Read-only; no tools executed, no network. */
import { tools as registeredTools } from '../../api/src/modules/tools/registry';
import { capableTools } from '../../api/src/core/orchestrator/capability-match';

interface Case { id: string; request: string; markers?: string[]; expectEmpty?: boolean }

const BATTERY: Case[] = [
  // git family: vary verbs/objects; v4 keeps the 065 'commit' verb with a neutral payload.
  { id: 'git-v1-push', request: 'Push my changes to the remote repository', markers: ['git'] },
  { id: 'git-v2-branch', request: 'Create a new branch for the login feature', markers: ['git'] },
  { id: 'git-v3-explicit', request: 'Show me the git status of this repo', markers: ['git'] },
  { id: 'git-v4-commit-neutral', request: 'Commit all changes with the message update readme', markers: ['git'] },
  // memory family: vary verbs; v3 keeps 'remember' in question form.
  { id: 'mem-v1-recall', request: 'Recall what I told you about my theme preference', markers: ['memory'] },
  { id: 'mem-v2-save', request: 'Save my dark mode preference for next time', markers: ['memory'] },
  { id: 'mem-v3-remember-q', request: 'What do you remember about my settings?', markers: ['memory'] },
  { id: 'mem-v4-explicit', request: 'Search your memory for my earlier instructions', markers: ['memory'] },
  // HIT regressions (065 HITs must stay HITs) + negative control.
  { id: 'reg-read', request: 'Read the file package.json and show me its contents', markers: ['read'] },
  { id: 'reg-shell', request: 'Execute node index.js in the shell and capture the output', markers: ['shell', 'terminal'] },
  { id: 'negative', request: 'blorpt zzzqx fnord', expectEmpty: true },
];

const names = (registeredTools as any[]).filter((t) => t && typeof t.name === 'string').map((t) => String(t.name));
const lower = names.map((n) => n.toLowerCase());

const rows = BATTERY.map((c) => {
  const top = capableTools(c.request, 8).map((h: any) => ({ name: h.name, score: h.score, why: h.why }));
  if (c.expectEmpty) return { id: c.id, verdict: top.length === 0 ? 'PASS_DECLINED' : 'FAIL_GUESSED', top };
  const markers = (c.markers || []).map((m) => m.toLowerCase());
  const setupHits = markers.filter((m) => lower.some((n) => n.includes(m)));
  if (!setupHits.length) return { id: c.id, verdict: 'SETUP_INVALID', markers: c.markers, top };
  const hit = top.filter((h: any) => markers.some((m) => h.name.toLowerCase().includes(m)));
  return { id: c.id, verdict: hit.length ? 'HIT' : 'MISS', markers: c.markers, hitNames: hit.map((h: any) => h.name), top: top.slice(0, 4) };
});

console.log(JSON.stringify({ registered: names.length, rows }, null, 1));

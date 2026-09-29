// One-shot anchor repair for panel-shows-the-audit.test.ts (CRLF-preserving).
// Replaces 3 stale source-text anchors with current ones; each anchor must
// occur exactly once or the script aborts without writing.
const fs = require('fs');
const file = 'D:\\Joe\\muse-worktree\\api\\src\\__tests__\\panel-shows-the-audit.test.ts';
const raw = fs.readFileSync(file, 'utf8');
const CRLF = '\r\n';
if (raw.includes('\n') && !raw.includes('\r\n')) throw new Error('unexpected LF-only file');
const lines = raw.split('\r\n');
const count = (s) => lines.filter((l) => l === s).length;

const edits = [
  {
    old: '        const installAt = r.indexOf("run(\'npm\', [\'install\'");',
    next: [
      '        // The dependency phase grew a second road - an exact-cache `npm ci`',
      '        // beside the network `npm install` - and both invocations are now',
      '        // multi-line. The guarantee never named an argument layout: the',
      '        // browser warms before EITHER road is taken, and either road runs',
      '        // before the audit starts.',
      '        const ciAt = r.indexOf("\'ci\', \'--offline\'");',
      '        const installAt = r.indexOf("\'install\', \'--prefer-offline\'");',
    ],
  },
  {
    old: '        expect(warmAt).toBeLessThan(installAt);',
    next: [
      '        expect(ciAt).toBeGreaterThan(0);',
      '        expect(installAt).toBeGreaterThan(0);',
      '        expect(warmAt).toBeLessThan(ciAt);',
      '        expect(warmAt).toBeLessThan(installAt);',
    ],
  },
  {
    old: '        expect(installAt).toBeLessThan(auditAt);',
    next: [
      '        expect(ciAt).toBeLessThan(auditAt);',
      '        expect(installAt).toBeLessThan(auditAt);',
    ],
  },
  {
    old: '        expect(p).toMatch(/warmBrowserSession\\(PANEL_BROWSER_SID\\)/);',
    next: [
      '        // The repair used to warm the panel session by name; it now warms',
      '        // the EFFECTIVE session - an explicit input, else the context',
      '        // session, else the panel - so a repair handed another session does',
      '        // not warm a browser nobody watches. The panel remains the fallback.',
      '        expect(p).toMatch(/warmBrowserSession\\(watchSessionId\\)/);',
      '        expect(p).toContain("const watchSessionId = String(input?.watchSessionId || context?.browserSessionId || PANEL_BROWSER_SID || \'\').trim();");',
    ],
  },
  {
    old: "        // The audit emits 'pressing' as well as 'watching' / 'private'.",
    next: [
      "        // The audit's mid-run vocabulary moved on: auditBuiltApp now emits",
      "        // 'discovering' where it once emitted 'pressing' ('pressing' still",
      '        // lives on the page-builder path, pinned by audit-plumbing). The',
      '        // guarantee never named the word - it is that every later event is',
      '        // gated on the watcher - so this pins the CURRENT emission and its',
      '        // guarded handler as a pair. A lone emission assertion let the',
      '        // rename drift unpinned for weeks.',
    ],
  },
  {
    old: '        expect(r).toMatch(/auditVisible = false;/);',
    next: [
      '        expect(r).toMatch(/auditVisible = false;/);',
      "        expect(r).toMatch(/if \\(where === 'discovering' && auditVisible\\)/);",
    ],
  },
  {
    old: '        expect(a).toMatch(/onProgress\\?\\.\\(\'pressing\'\\)/);',
    next: [
      '        expect(a).toMatch(/onProgress\\?\\.\\(\'discovering\'\\)/);',
    ],
  },
];

for (const e of edits) {
  const n = count(e.old);
  if (n !== 1) throw new Error(`anchor ${n}x (expected 1x): ${e.old.slice(0, 60)}`);
}
const out = [];
for (const l of lines) {
  const hit = edits.find((e) => e.old === l);
  if (hit) out.push(...hit.next);
  else out.push(l);
}
fs.writeFileSync(file, out.join(CRLF));
console.log(`OK: ${edits.length} anchors replaced, ${out.length} lines, CRLF preserved`);

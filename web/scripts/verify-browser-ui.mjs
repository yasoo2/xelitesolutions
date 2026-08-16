import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stream = await readFile(resolve(root, 'src/components/ModernBrowserStream.tsx'), 'utf8');
const css = await readFile(resolve(root, 'src/styles/joe-premium.css'), 'utf8');

const checks = [
  ['the live stream exposes a stable root test hook', stream.includes('data-testid="browser-stream-root"')],
  ['the control rail is present and corner-scoped', stream.includes('data-testid="browser-control-rail"') && css.includes('.browser-control-rail {') && css.includes('position: absolute;')],
  ['the control rail stays compact and non-blocking at the lower edge', css.includes('bottom: 14px;') && css.includes('opacity: 0.68;') && css.includes('pointer-events: none;') && stream.includes("'CTRL'" )],
  ['manual control remains accessible as a compact action', stream.includes('data-testid="browser-control-button"') && stream.includes("setManualMode((active) => !active)")],
  ['live QA reports connection, frame freshness, queue and action errors', stream.includes('runQualityCheck') && stream.includes('lastFrameAt') && stream.includes('queueLen') && stream.includes('actionErrors')],
  ['fullscreen and snapshot actions are wired', stream.includes('requestFullscreen') && stream.includes('captureSnapshot') && stream.includes('data-testid="browser-capture-button"')],
  ['desktop browser surface is wider than half the viewport', css.includes('width: clamp(620px, 58vw, 980px);')],
  ['small laptops preserve a browser surface over half the viewport', css.includes('width: clamp(560px, 58vw, 760px);')],
  ['phones use the established full-screen overlay instead of overflow', css.includes('@media (max-width: 900px)') && css.includes('width: 100% !important;'),
  ],
  ['the removed full-width login banner cannot reappear accidentally', !stream.includes('loginBarHidden') && !stream.includes('joe_login_bar_hidden')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, `browser UI contract failed: ${name}`);
  console.log(`PASS ${name}`);
}
console.log(`Browser UI contract: ${checks.length}/${checks.length} passed`);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stream = await readFile(resolve(root, 'src/components/ModernBrowserStream.tsx'), 'utf8');
const composer = await readFile(resolve(root, 'src/components/CommandComposer.tsx'), 'utf8');
const embedded = await readFile(resolve(root, 'src/components/EmbeddedBrowser.tsx'), 'utf8');
const css = await readFile(resolve(root, 'src/styles/joe-premium.css'), 'utf8');
const joePage = await readFile(resolve(root, 'src/pages/Joe.tsx'), 'utf8');

const checks = [
  ['the live stream exposes a stable root test hook', stream.includes('data-testid="browser-stream-root"')],
  ['the control rail is present and corner-scoped', stream.includes('data-testid="browser-control-rail"') && css.includes('.browser-control-rail {') && css.includes('position: absolute;')],
  ['the control rail stays compact and non-blocking at the lower edge', css.includes('bottom: 14px;') && css.includes('opacity: 0.68;') && css.includes('pointer-events: none;') && stream.includes("'CTRL'" )],
  ['manual control remains accessible as a compact action', stream.includes('data-testid="browser-control-button"') && stream.includes("setManualMode((active) => !active)")],
  ['live QA reports connection, frame freshness, queue and action errors', stream.includes('runQualityCheck') && stream.includes('lastFrameAt') && stream.includes('queueLen') && stream.includes('actionErrors')],
  ['QA report can be copied and session evidence can be exported', stream.includes('copyQaReport') && stream.includes('exportSessionEvidence') && stream.includes('joe.browser.session-evidence.v1')],
  ['action log exposes filter and text search controls', stream.includes('browser-action-filters') && stream.includes('actionFilter') && stream.includes('actionQuery') && stream.includes('filteredBrowserActions')],
  ['browser recovery alerts stay out of the preview while detailed QA reports go to chat', stream.includes('browser-quality-signal') && stream.includes('qualityNeedsRecovery') && stream.includes("browser:quality_report") && !stream.includes('browser-recovery-banner') && !stream.includes('browser-quality-popover') && !css.includes('.browser-recovery-banner') && !css.includes('.browser-quality-popover') && composer.includes('browser_quality_report')],
  ['live telemetry is surfaced from page, quality, diagnostics and action events', stream.includes("'page_snapshot'") && stream.includes("'page_diagnostics'") && stream.includes("'browser_quality'") && stream.includes("'browser_action'") && stream.includes('browser:quality') && stream.includes('browser:diagnostics')],
  ['embedded browser consumes telemetry without creating a second layout', embedded.includes('browser:page_snapshot') && embedded.includes('browser:quality') && embedded.includes('browser:diagnostics') && embedded.includes('liveQuality')],
  ['fullscreen and snapshot actions are wired', stream.includes('requestFullscreen') && stream.includes('captureSnapshot') && stream.includes('data-testid="browser-capture-button"')],
  ['the details log opens for unified browser actions as well as legacy action events', stream.includes('actions.length || browserActions.length || final || debug')],
  ['empty browser state is honest before the first frame', stream.includes('data-testid="browser-empty-state"') && stream.includes('waitingForPage') && stream.includes('lastFrameAt === null')],
  ['desktop browser surface is wider than half the viewport', css.includes('width: clamp(620px, 58vw, 980px);')],
  ['small laptops preserve a browser surface over half the viewport', css.includes('width: clamp(560px, 58vw, 760px);')],
  ['phones use the established full-screen overlay instead of overflow', css.includes('@media (max-width: 900px)') && css.includes('width: 100% !important;'),
  ],
  ['the removed full-width login banner cannot reappear accidentally', !stream.includes('loginBarHidden') && !stream.includes('joe_login_bar_hidden')],
  ['existing workspace artifacts suppress onboarding safely', joePage.includes("api.get('/project/tree')") && joePage.includes('hasVisibleArtifacts') && joePage.includes('if (!hasVisibleArtifacts) setIsOnboardingOpen(true)')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, `browser UI contract failed: ${name}`);
  console.log(`PASS ${name}`);
}
console.log(`Browser UI contract: ${checks.length}/${checks.length} passed`);

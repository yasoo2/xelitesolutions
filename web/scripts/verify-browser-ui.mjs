import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stream = await readFile(resolve(root, 'src/components/ModernBrowserStream.tsx'), 'utf8');
const composer = await readFile(resolve(root, 'src/components/CommandComposer.tsx'), 'utf8');
const embedded = await readFile(resolve(root, 'src/components/EmbeddedBrowser.tsx'), 'utf8');
const githubDialog = await readFile(resolve(root, 'src/components/GitHubConnectDialog.tsx'), 'utf8');
const neuralIndicator = await readFile(resolve(root, 'src/components/NeuralThinkingIndicator.tsx'), 'utf8');
const neuralTrace = await readFile(resolve(root, 'src/components/NeuralTraceView.tsx'), 'utf8');
const neuralModel = await readFile(resolve(root, 'src/lib/neuralTrace.ts'), 'utf8');
const css = await readFile(resolve(root, 'src/styles/joe-premium.css'), 'utf8');
const joePage = await readFile(resolve(root, 'src/pages/Joe.tsx'), 'utf8');
const sessionsBar = await readFile(resolve(root, 'src/components/SessionsBar.tsx'), 'utf8');

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
  ['GitHub dialog has close, Done, and real disconnect actions', githubDialog.includes("aria-label={t('close', 'Close')}") && githubDialog.includes("t('done', 'Done')") && githubDialog.includes('<X size={18} />') && githubDialog.includes('onDisconnect') && githubDialog.includes('<LogOut size={15} />')],
  ['neural activity separates the human summary from the expandable trace', neuralIndicator.includes('neuralWorking') && neuralIndicator.includes('WorkStageRail') && neuralIndicator.includes('nc-detail') && neuralTrace.includes('jt-stage-rail')],
  ['neural stages derive from observed events and never invent completion percentages', neuralModel.includes('workStageFor') && neuralModel.includes('WORK_STAGES') && !neuralIndicator.includes('% complete')],
  ['machine progress labels are translated into user-facing activity labels', neuralModel.includes('traceDisplayKey') && neuralTrace.includes('displayKey') && neuralIndicator.includes('displayKey')],
  ['primary workspace surfaces stay flat while real detail tools remain available', css.includes('MODERN WORKSPACE SURFACES') && css.includes('backdrop-filter: none;') && css.includes('box-shadow: none !important;') && css.includes('.joe-workspace-tab.active')],
  ['workspace tabs use a quiet active rule instead of nested pill cards', css.includes('.joe-tab-segment {') && css.includes('border: 0;') && css.includes('border-bottom-color: var(--joe-gold-primary);')],
  ['session navigation and user messages do not render as filled card stacks', css.includes('.joe-sessions-bar') && css.includes('.joe-session-chip') && css.includes('background: transparent;') && css.includes('border-inline-end: 2px solid var(--joe-blue-primary);') && sessionsBar.includes('className="joe-sessions-new"') && sessionsBar.includes('className="joe-session-chip"')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, `browser UI contract failed: ${name}`);
  console.log(`PASS ${name}`);
}
console.log(`Browser UI contract: ${checks.length}/${checks.length} passed`);

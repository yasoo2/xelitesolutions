import { renderObservation, type Observation } from '../modules/browser/reactLoop';

describe('browser runtime evidence reaches the decision brain', () => {
  it('renders measured quality, diagnostics and the recovery rule', () => {
    const observation: Observation = {
      url: 'http://127.0.0.1:5001/',
      title: 'Test page',
      textSnippet: 'Ready',
      elements: [],
      runtime: {
        status: 'degraded',
        reason: 'runtime_or_action_errors',
        fps: 12.4,
        frameAgeMs: 120,
        jitterMs: 18.5,
        actionsInFlight: 1,
        actionErrors: 2,
        jsErrors: 1,
        networkErrors: 0,
        lastActionLatencyMs: 840,
        recent: [{ kind: 'pageerror', message: 'ReferenceError: missingFn is not defined', ts: Date.now() }],
      },
    };

    const rendered = renderObservation(observation);
    expect(rendered).toContain('RUNTIME: status=degraded reason=runtime_or_action_errors');
    expect(rendered).toContain('fps=12.4');
    expect(rendered).toContain('actionErrors=2');
    expect(rendered).toContain('jsErrors=1');
    expect(rendered).toContain('RECENT RUNTIME DIAGNOSTICS: pageerror:ReferenceError: missingFn is not defined');
    expect(rendered).toContain('never claim the page is healthy from DOM alone');
  });

  it('does not invent a runtime health status when no sample is available', () => {
    const observation: Observation = {
      url: 'about:blank',
      title: '',
      textSnippet: '',
      elements: [],
    };

    const rendered = renderObservation(observation);
    expect(rendered).not.toContain('RUNTIME:');
    expect(rendered).not.toContain('status=good');
  });

  it('passes the previous failed action to the brain as recovery evidence', () => {
    const rendered = renderObservation({
      url: 'http://127.0.0.1:5001/',
      title: 'Local Joe',
      textSnippet: 'Ready',
      elements: [],
      lastActionResult: { action: 'ينقر «تشغيل»', ok: false, note: 'element_not_interactable' },
    });

    expect(rendered).toContain('LAST ACTION RESULT: ينقر «تشغيل»; ok=false; note=element_not_interactable');
    expect(rendered).toContain('choose a different evidence-based recovery step');
    expect(rendered).not.toContain('status=good');
  });
});

// Keep the backend telemetry contract close to the consumer contract.
describe('browser telemetry source contract', () => {
  it('exposes a session snapshot and cleans its own lifecycle resources', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'telemetry.ts'), 'utf8');
    expect(source).toContain('export function getBrowserTelemetrySnapshot');
    expect(source).toContain('export function disposeBrowserTelemetry');
    expect(source).toContain('errorTimes: { js: number[]; network: number[]; action: number[] }');
    expect(source).toContain('const cutoff = now - 5000');
    expect(source).toContain('clearInterval(state.timer)');
    expect(source).toContain("state.page.removeListener('pageerror'");
    expect(source).toContain("state.page.removeListener('requestfailed'");
  });
});

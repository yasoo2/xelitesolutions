import {
  renderObservation,
  selectPrimaryStep,
  summarizeStepEffect,
  type Observation,
} from '../modules/browser/reactLoop';

describe('summarizeStepEffect', () => {
  it('copies the boolean/number effect signal and drops everything else', () => {
    expect(
      summarizeStepEffect({
        stepId: 's1',
        name: 'click_coordinates',
        ok: true,
        message: 'clicked',
        selector: '#enter',
        navigated: false,
        domChanged: true,
        effectObserved: true,
        runtimeErrors: 0,
      }),
    ).toEqual({ effectObserved: true, navigated: false, domChanged: true, runtimeErrors: 0 });
  });

  it('keeps action-specific flags such as typedIntoVoid and atEdge', () => {
    expect(
      summarizeStepEffect({ name: 'type', ok: true, effectObserved: false, typedIntoVoid: true, valueApplied: false }),
    ).toEqual({ effectObserved: false, valueApplied: false, typedIntoVoid: true });
    expect(
      summarizeStepEffect({ name: 'scroll', ok: true, effectObserved: false, scrolled: false, atEdge: true }),
    ).toEqual({ effectObserved: false, scrolled: false, atEdge: true });
  });

  it('returns undefined when the step carries no effect signal', () => {
    expect(summarizeStepEffect({ stepId: 's1', name: 'thought', ok: true, message: 'x' })).toBeUndefined();
    expect(summarizeStepEffect({})).toBeUndefined();
    expect(summarizeStepEffect(null)).toBeUndefined();
    expect(summarizeStepEffect('s1')).toBeUndefined();
  });

  it('ignores mistyped values for known keys instead of copying them', () => {
    expect(
      summarizeStepEffect({ name: 'click', effectObserved: 'yes', domChanged: 1, runtimeErrors: '0' }),
    ).toBeUndefined();
  });
});

describe('selectPrimaryStep', () => {
  it('picks the first non-wait step (executor lists trail a settling wait)', () => {
    const steps = [
      { name: 'click_coordinates', ok: true },
      { name: 'wait', ok: true },
    ];
    expect(selectPrimaryStep(steps)).toBe(steps[0]);
  });

  it('falls back to the first step when every step is a wait', () => {
    const steps = [{ name: 'wait', ok: true }];
    expect(selectPrimaryStep(steps)).toBe(steps[0]);
  });

  it('returns undefined for empty or missing step lists', () => {
    expect(selectPrimaryStep([])).toBeUndefined();
    expect(selectPrimaryStep(undefined as any)).toBeUndefined();
  });
});

describe('renderObservation effect awareness', () => {
  function observationWith(effect: any, ok = true): Observation {
    return {
      url: 'http://127.0.0.1:9/quay-office',
      title: 'Quay office',
      textSnippet: 'Night clerks only.',
      elements: [],
      lastActionResult: { action: 'click #3', ok, effect },
    };
  }

  it('renders the observed effect beside the last action result', () => {
    const rendered = renderObservation(
      observationWith({ effectObserved: true, navigated: false, domChanged: true, runtimeErrors: 0 }),
    );
    expect(rendered).toContain('LAST ACTION RESULT: click #3; ok=true;');
    expect(rendered).toContain(
      'LAST ACTION EFFECT: effectObserved=true; navigated=false; domChanged=true; runtimeErrors=0',
    );
  });

  it('adds a no-effect recovery rule when an ok action changed nothing observable', () => {
    const rendered = renderObservation(
      observationWith({ effectObserved: false, navigated: false, domChanged: false, runtimeErrors: 0 }),
    );
    expect(rendered).toContain('LAST ACTION EFFECT: effectObserved=false;');
    expect(rendered).toContain('NO-EFFECT RULE:');
    expect(rendered).toContain('do NOT assume progress');
  });

  it('renders no no-effect rule when an effect was observed', () => {
    const rendered = renderObservation(observationWith({ effectObserved: true, domChanged: true }));
    expect(rendered).toContain('LAST ACTION EFFECT:');
    expect(rendered).not.toContain('NO-EFFECT RULE:');
  });

  it('renders no effect line at all when the step carried no signal', () => {
    const rendered = renderObservation({
      url: 'http://127.0.0.1:9/quay-office',
      title: 'Quay office',
      textSnippet: 'Night clerks only.',
      elements: [],
      lastActionResult: { action: 'click #3', ok: true },
    });
    expect(rendered).toContain('LAST ACTION RESULT: click #3; ok=true;');
    expect(rendered).not.toContain('LAST ACTION EFFECT:');
    expect(rendered).not.toContain('NO-EFFECT RULE:');
  });

  it('keeps the failure recovery rule when the action itself failed', () => {
    const rendered = renderObservation(
      observationWith({ effectObserved: false, domChanged: false }, false),
    );
    expect(rendered).toContain('RECOVERY RULE:');
    expect(rendered).not.toContain('NO-EFFECT RULE:');
  });
});

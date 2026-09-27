import {
  NO_EFFECT_STOP_AFTER,
  updateNoEffectStreak,
} from '../modules/browser/reactLoop';

describe('NO_EFFECT_STOP_AFTER', () => {
  it('mirrors the three-consecutive-failure stop policy', () => {
    expect(NO_EFFECT_STOP_AFTER).toBe(3);
  });
});

describe('updateNoEffectStreak', () => {
  it('counts consecutive ok actions with explicitly no observed effect', () => {
    expect(updateNoEffectStreak(0, true, { effectObserved: false })).toBe(1);
    expect(updateNoEffectStreak(1, true, { effectObserved: false })).toBe(2);
    expect(updateNoEffectStreak(2, true, { effectObserved: false })).toBe(3);
  });

  it('resets on an explicitly observed effect (real progress)', () => {
    expect(updateNoEffectStreak(2, true, { effectObserved: true, domChanged: true })).toBe(0);
    expect(updateNoEffectStreak(0, true, { effectObserved: true })).toBe(0);
  });

  it('resets on a failed action even when the receipt claims no effect', () => {
    expect(updateNoEffectStreak(2, false, { effectObserved: false })).toBe(0);
    expect(updateNoEffectStreak(2, false, undefined)).toBe(0);
  });

  it('leaves the streak unchanged when the effect is unknown', () => {
    expect(updateNoEffectStreak(2, true, undefined)).toBe(2);
    expect(updateNoEffectStreak(2, true, {})).toBe(2);
    expect(updateNoEffectStreak(2, true, { runtimeErrors: 0 })).toBe(2);
    // Mistyped signals are not signals (summarizeStepEffect already drops
    // them; the streak must not treat them as false OR true).
    expect(updateNoEffectStreak(2, true, { effectObserved: 'no' } as any)).toBe(2);
    expect(updateNoEffectStreak(2, true, { effectObserved: 0 } as any)).toBe(2);
  });

  it('sanitizes a corrupt previous count instead of propagating it', () => {
    expect(updateNoEffectStreak(-5, true, { effectObserved: false })).toBe(1);
    expect(updateNoEffectStreak(NaN, true, { effectObserved: false })).toBe(1);
    expect(updateNoEffectStreak(1.9, true, { effectObserved: false })).toBe(2);
  });

  it('folds a realistic mixed run: fruitless, fruitless, progress, fruitless', () => {
    let streak = 0;
    streak = updateNoEffectStreak(streak, true, { effectObserved: false });
    streak = updateNoEffectStreak(streak, true, { effectObserved: false });
    expect(streak).toBe(2);
    streak = updateNoEffectStreak(streak, true, { effectObserved: true });
    expect(streak).toBe(0);
    streak = updateNoEffectStreak(streak, true, { effectObserved: false });
    expect(streak).toBe(1);
  });

  it('does not let an unknown receipt hide between fruitless actions', () => {
    // Unknown is neutral: it neither extends nor breaks the count, so an
    // unreadable receipt between two dead clicks keeps the streak at 2 and
    // the third dead click still stops the loop.
    let streak = 0;
    streak = updateNoEffectStreak(streak, true, { effectObserved: false });
    streak = updateNoEffectStreak(streak, true, undefined);
    streak = updateNoEffectStreak(streak, true, { effectObserved: false });
    expect(streak).toBe(2);
    streak = updateNoEffectStreak(streak, true, { effectObserved: false });
    expect(streak).toBe(3);
  });
});

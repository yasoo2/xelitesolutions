/**
 * Additive PURE-helper tests for explicit canonical-local selection.
 *
 * Scope: pure helper only (`explicit-local-selection.ts`). These are NOT
 * full-router evidence: no router import, provider/SDK execution, network,
 * or local-model inference. The router selection boundary (predicate +
 * inert leaf mocks) is left for root integration runs.
 */
import {
  classifyExplicitLocalSelection,
  isCanonicalLocalBaseUrl,
  isIgnorableLocalKey,
  isLoopbackHostname,
  localKeyClass,
  normalizeLocalBaseUrlForSdk,
} from '../core/llm/explicit-local-selection';

describe('explicit canonical-local selection (pure helper)', () => {
  const MODEL = 'qwen2.5:1.5b';
  const BASE = 'http://localhost:11434';

  it.each(['localhost', '127.0.0.1', '::1', '[::1]', 'LOCALHOST'])(
    'recognises loopback host %s',
    (host) => {
      expect(isLoopbackHostname(host)).toBe(true);
    },
  );

  it('rejects remote hostnames', () => {
    expect(isLoopbackHostname('example.com')).toBe(false);
    expect(isLoopbackHostname('192.168.1.10')).toBe(false);
    expect(isLoopbackHostname('')).toBe(false);
  });

  it.each([
    'http://localhost:11434',
    'http://localhost:11434/',
    'http://localhost:11434/v1',
    'http://127.0.0.1:11434/v1/',
    'http://[::1]:11434/',
  ])('accepts canonical endpoint %s', (baseUrl) => {
    expect(isCanonicalLocalBaseUrl(baseUrl)).toBe(true);
  });

  it('rejects blank endpoints as non-canonical', () => {
    expect(isCanonicalLocalBaseUrl('')).toBe(false);
    expect(isCanonicalLocalBaseUrl('   ')).toBe(false);
  });

  it('rejects credentials/query/hash/remote/other-ports/non-http', () => {
    expect(isCanonicalLocalBaseUrl('')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://user:pass@localhost:11434/')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://localhost:11434/?x=1')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://localhost:11434/#frag')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://example.com:11434/')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://localhost:8080/')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://localhost:11434/v2')).toBe(false);
    expect(isCanonicalLocalBaseUrl('https://localhost:11434/')).toBe(false);
  });

  it('rejects known lexical URL-normalization aliases/traversal/empty delimiters', () => {
    expect(isCanonicalLocalBaseUrl('http://127.1:11434/')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://2130706433:11434/')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://0x7f000001:11434/')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://localhost:11434/other/../v1')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://user@localhost:11434/')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://localhost:11434/?')).toBe(false);
    expect(isCanonicalLocalBaseUrl('http://localhost:11434/#')).toBe(false);
  });

  it('normalizes canonical root to SDK /v1 and fails closed otherwise', () => {
    expect(normalizeLocalBaseUrlForSdk('http://localhost:11434')).toBe('http://localhost:11434/v1');
    expect(normalizeLocalBaseUrlForSdk('http://localhost:11434/')).toBe('http://localhost:11434/v1');
    expect(normalizeLocalBaseUrlForSdk('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(normalizeLocalBaseUrlForSdk('http://example.com:11434/')).toBeUndefined();
  });

  it('normalizes root/v1/IPv6 hosts with case normalization', () => {
    expect(normalizeLocalBaseUrlForSdk('HTTP://LOCALHOST:11434')).toBe('http://localhost:11434/v1');
    expect(normalizeLocalBaseUrlForSdk('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434/v1');
    expect(normalizeLocalBaseUrlForSdk('http://[::1]:11434/v1/')).toBe('http://[::1]:11434/v1');
  });

  it.each([[''], ['auto-mode'], ['free-mode'], ['dummy']])(
    'keeps the selected model for ignorable key class %s',
    (apiKey) => {
      const decision = classifyExplicitLocalSelection({
        provider: 'local',
        model: MODEL,
        baseUrl: 'http://localhost:11434',
        apiKey,
      });
      expect(decision.eligible).toBe(true);
      expect(decision.kind).toBe('eligible-local');
      expect(decision.model).toBe(MODEL);
      expect(decision.normalizedBaseUrl).toBe('http://localhost:11434/v1');
    },
  );

  it('classifies key classes without erasing eligibility', () => {
    expect(localKeyClass('')).toBe('blank');
    expect(localKeyClass('auto-mode')).toBe('auto-mode');
    expect(localKeyClass('free-mode')).toBe('free-mode');
    expect(localKeyClass('dummy')).toBe('dummy');
    expect(isIgnorableLocalKey('dummy')).toBe(true);
    expect(isIgnorableLocalKey('[REDACTED]')).toBe(false);
  });

  it('never lets real/non-ascii/dummy/malformed key classes affect a validated model', () => {
    const keys: unknown[] = ['', 'dummy', 'sk-live-real-key', 'clé-secrète', 123, null];
    for (const apiKey of keys) {
      const decision = classifyExplicitLocalSelection({
        provider: 'local',
        model: MODEL,
        baseUrl: 'http://localhost:11434',
        apiKey,
      });
      expect(decision.kind).toBe('eligible-local');
      expect(decision.eligible).toBe(true);
      expect(decision.model).toBe(MODEL);
    }
  });

  it('fails closed for explicit -cloud models', () => {
    const decision = classifyExplicitLocalSelection({
      provider: 'local',
      model: 'qwen2.5:1.5b-cloud',
      baseUrl: 'http://localhost:11434',
      apiKey: '',
    });
    expect(decision.eligible).toBe(false);
    expect(decision.kind).toBe('cloud-local');
    expect(decision.normalizedBaseUrl).toBeUndefined();
  });

  it('fails closed for known official cloud markers case-insensitively', () => {
    for (const model of [
      'gpt-oss:120b-cloud',
      'GPT-OSS:120B-CLOUD',
      'kimi-k2.5:cloud',
      'KIMI-K2.5:CLOUD',
    ]) {
      const decision = classifyExplicitLocalSelection({
        provider: 'local',
        model,
        baseUrl: 'http://localhost:11434',
        apiKey: '',
      });
      expect(decision.kind).toBe('cloud-local');
      expect(decision.eligible).toBe(false);
      expect(decision.normalizedBaseUrl).toBeUndefined();
    }
  });

  it('fails closed for malformed remote local configs without new dispatch', () => {
    for (const baseUrl of ['http://example.com:11434/', 'http://localhost:8080/', '']) {
      const decision = classifyExplicitLocalSelection({ provider: 'local', model: MODEL, baseUrl, apiKey: '' });
      expect(decision.eligible).toBe(false);
      expect(decision.kind).toBe('invalid-local');
    }
  });

  it('rejects Auto-picker models and distinguishes vendor selections', () => {
    for (const model of ['auto', 'free', 'default', 'mock', '']) {
      expect(
        classifyExplicitLocalSelection({ provider: 'local', model, baseUrl: 'http://localhost:11434', apiKey: '' }).eligible,
      ).toBe(false);
    }
    // A real-key vendor selection is NOT explicit local.
    expect(
      classifyExplicitLocalSelection({ provider: 'openai', model: 'gpt-4o', baseUrl: undefined, apiKey: 'sk-real' }).kind,
    ).toBe('not-explicit-local');
    // Explicit local stays eligible even beside a populated env-style real key input class.
    expect(localKeyClass('sk-real')).toBe('real');
  });

  it('keeps missing/blank/picker models as not-explicit-local to preserve Auto mesh', () => {
    const blankCases: unknown[] = [undefined, '', '   ', 'auto', 'AUTO', ' mock ', 'free', 'FREE', 'default', 'DEFAULT'];
    for (const model of blankCases) {
      const decision = classifyExplicitLocalSelection({
        provider: 'local',
        model,
        baseUrl: 'http://localhost:11434',
        apiKey: '',
      });
      expect(decision.kind).toBe('not-explicit-local');
      expect(decision.eligible).toBe(false);
    }
  });

  it('marks provided non-string models as malformed invalid-local', () => {
    const malformed: unknown[] = [123, true, false, null, { name: MODEL }];
    for (const model of malformed) {
      const decision = classifyExplicitLocalSelection({
        provider: 'local',
        model,
        baseUrl: 'http://localhost:11434',
        apiKey: '',
      });
      expect(decision.kind).toBe('invalid-local');
      expect(decision.eligible).toBe(false);
    }
  });

  it('trims the selected model once and rejects embedded whitespace/control names', () => {
    const trimmed = classifyExplicitLocalSelection({
      provider: 'local',
      model: '  qwen2.5:1.5b  ',
      baseUrl: 'http://localhost:11434/',
      apiKey: '',
    });
    expect(trimmed.kind).toBe('eligible-local');
    expect(trimmed.eligible).toBe(true);
    expect(trimmed.model).toBe('qwen2.5:1.5b');
    for (const model of ['qwen 2.5', 'qwen\t2.5', 'qwen\n2.5', 'qwen2.5']) {
      const decision = classifyExplicitLocalSelection({
        provider: 'local',
        model,
        baseUrl: 'http://localhost:11434',
        apiKey: '',
      });
      expect(decision.kind).toBe('invalid-local');
      expect(decision.eligible).toBe(false);
    }
  });
});

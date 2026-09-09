export interface ExternalApiRequirement {
    id: string;
    text: string;
    quote: string;
}

export interface ExternalApiVerdict extends ExternalApiRequirement {
    verdict: 'met' | 'unmet';
    why: string;
}

export function externalApiSourceVerdict(
    requirement: ExternalApiRequirement,
    source: string,
): ExternalApiVerdict | null {
    const executable = String(source || '')
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/^\s*\/\/.*$/gmu, '');
    const capability = String(executable.match(/["']capability["']\s*:\s*["'](weather|currency|ip)["']/iu)?.[1] || '').toLowerCase();
    if (!capability) return null;

    const texts = [requirement.text, requirement.quote]
        .map(value => String(value || '').trim())
        .filter((value, index, values) => value && values.indexOf(value) === index);
    const all = (pattern: RegExp) => texts.length > 0 && texts.every(value => pattern.test(value));
    const mentionsPublicApi = all(/^(?:use|using|with)\s+(?:a\s+)?public\s+api(?:\s+that\s+does\s+not\s+require\s+(?:authentication|an?\s+api\s+key)(?:\s+if\s+possible)?)?[.]?$/iu);
    const mentionsNoAuth = all(/^(?:that\s+)?(?:does\s+not\s+require|without|no)\s+(?:authentication|auth|an?\s+api\s+key)(?:\s+if\s+possible)?[.]?$/iu);
    const capabilityRequest = capability === 'currency'
        ? all(/^(?:create|build|make)\s+(?:me\s+)?(?:a\s+)?(?:simple\s+)?currency\s+converter(?:\s+(?:using|with)\s+(?:a\s+)?public\s+api)?(?:\s+that\s+does\s+not\s+require\s+authentication\s+if\s+possible)?[.]?$/iu)
        : capability === 'weather'
            ? all(/^(?:create|build|make)\s+(?:me\s+)?(?:a\s+)?(?:simple\s+)?weather\s+dashboard(?:\s+(?:using|with)\s+(?:a\s+)?(?:free\s+)?public\s+api)?[.]?$/iu)
            : all(/^(?:create|build|make)\s+(?:me\s+)?(?:an?\s+)?ip\s+(?:information|lookup|geolocation)\s+page(?:\s+(?:using|with)\s+(?:a\s+)?public\s+api)?[.]?$/iu);
    if (!mentionsPublicApi && !mentionsNoAuth && !capabilityRequest) return null;

    const profile = String(executable.match(/["']integrationProfileId["']\s*:\s*["']([^"']+)["']/u)?.[1] || '');
    const selected = /["']apiId["']\s*:\s*["'][^"']+["']/u.test(executable);
    const client = /export\s+const\s+externalApi\s*=\s*\{[\s\S]{0,500}?async\s+load\s*\(/u.test(executable)
        && /AbortController/u.test(executable) && /response\.ok/u.test(executable);
    const transport = /^(?:frankfurter-currency-v2|weatherapi-key-v1)$/u.test(profile)
        ? /function\s+joeExternalApiProxy\s*\(/u.test(executable) && /redirect\s*:\s*['"]error['"]/u.test(executable) && /MAX_RESPONSE_BYTES/u.test(executable)
        : profile === 'open-meteo-weather-v1'
            ? /https:\/\/api\.open-meteo\.com\/v1/u.test(executable)
            : profile === 'ipapi-co-v1' && /https:\/\/ipapi\.co/u.test(executable);
    const visibleStates = /className\s*=\s*["']external-api-app["']/u.test(executable)
        && /role\s*=\s*["']status["']/u.test(executable)
        && /role\s*=\s*["']alert["']/u.test(executable);
    const noAuthRequired = mentionsNoAuth || /does\s+not\s+require\s+(?:authentication|an?\s+api\s+key)/iu.test(texts.join(' '));
    const noAuth = /["']auth["']\s*:\s*["']none["']/iu.test(executable)
        && /["']requiredEnvironmentVariables["']\s*:\s*\[\s*\]/u.test(executable);
    const missing = [
        !selected && 'trusted selection metadata',
        !client && 'a bounded failure-aware client',
        !transport && 'the maintained transport contract',
        !visibleStates && 'visible loading and error states',
        noAuthRequired && !noAuth && 'a no-auth provider',
    ].filter(Boolean);
    return {
        ...requirement,
        verdict: missing.length ? 'unmet' : 'met',
        why: missing.length
            ? `the generated external-data application is missing ${missing.join(', ')}`
            : `the generated project proves a maintained ${capability} integration${noAuthRequired ? ' with a no-auth provider' : ''}`,
    };
}

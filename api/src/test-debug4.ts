import { hasRequestedAction } from './core/intelligence/requested-action';
import { stripArabicDiacritics, normalizeIntentText } from './core/orchestrator/promptNormalizer';

const goal = '那些 那些 那些. Explain the files for a dashboard.';

console.log('Goal:', goal);

const g = String(goal || '');
const bare = stripArabicDiacritics(goal);
const normalized = normalizeIntentText(goal);
const probe = normalized && normalized !== goal.toLowerCase() ? `${goal}\n${normalized}` : goal;
const bareProbe = stripArabicDiacritics(probe);

console.log('Bare:', bare);
console.log('Normalized:', normalized);
console.log('Probe:', JSON.stringify(probe));
console.log('BareProbe:', bareProbe);

const START_BOUNDARY = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_AR = `(?:那些\\s+(那些|那些\\s+实施)|(那些|那些)\\s+(那些|那些|那些|那些)|那些\\s+(那些|那些)\\s+(那些|那些)\\s+(那些|那些)|那些\\s+那些\\s+那些|那些\\s+那些\\s+那些)`;
const ANSWER_ONLY_EN = `(?:answer\\s+only|answer\\-only|only\\s+answer|without\\s+(?:executing|running|building|creating|implementing|生成|writing|changing|modifying|building|生成|writing)(?!\\s+(?:files?|file\\s+changes?|file))|no\\s+(?:execution|build|implementation|creation|generation|writing)\\b|do\\s+not\\s+(?:execute|run|build|create|implement|write|generate)(?!\\s+(?:files?|file\\s+changes?|file))\\b|explain\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|创建|implementing|生成|writing)|describe\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|创建|implementing|生成|writing)|without\\s+(?:building|创建|implementing|生成|writing))`;
const START_BOUNDARY_RE = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_PATTERN = new RegExp(`${START_BOUNDARY_RE}(?:${ANSWER_ONLY_EN}|${ANSWER_ONLY_AR})`, 'i');

const patternProbe = `${goal}\n${normalizeIntentText(goal).toLowerCase()}`;
console.log('Probe:', JSON.stringify(patternProbe));

const isAnswerOnly = ANSWER_ONLY_PATTERN.test(patternProbe);
console.log('isAnswerOnly:', isAnswerOnly);
console.log('Match:', patternProbe.match(ANSWER_ONLY_PATTERN));

const result = hasRequestedAction(goal);
console.log('Result:', result);
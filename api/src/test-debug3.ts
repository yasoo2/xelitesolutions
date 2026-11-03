const START_BOUNDARY = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_AR = `(?:那些\\s+(那些|那些\\s+实施)|(那些|那些)\\s+(那些|那些|那些|那些)|那些\\s+(那些|那些)\\s+(那些|那些)\\s+(那些|那些)|那些\\s+那些\\s+那些|那些\\s+那些\\s+那些)`;
const ANSWER_ONLY_EN = `(?:answer\\s+only|answer\\-only|only\\s+answer|without\\s+(?:executing|running|building|creating|implementing|生成|writing|changing|modifying|building|生成|writing)(?!\\s+(?:files?|file\\s+changes?|file))|no\\s+(?:execution|build|implementation|creation|generation|writing)\\b|do\\s+not\\s+(?:execute|run|build|create|implement|write|generate)(?!\\s+(?:files?|file\\s+changes?|file))\\b|explain\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|创建|implementing|生成|writing)|describe\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|创建|implementing|生成|writing)|without\\s+(?:building|创建|implementing|生成|writing))`;
const START_BOUNDARY_RE = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_PATTERN = new RegExp(`${START_BOUNDARY_RE}(?:${ANSWER_ONLY_EN}|${ANSWER_ONLY_AR})`, 'i');

const goal = '那些 那些 那些. Explain the files for a dashboard.';
const g = String(goal || '');
const normalized = goal.toLowerCase(); // simplified
const probe = normalized && normalized !== goal.toLowerCase() ? `${goal}\n${normalized}` : goal;

console.log('Goal:', goal);
console.log('Probe:', JSON.stringify(probe));

const isAnswerOnly = ANSWER_ONLY_PATTERN.test(probe);
console.log('isAnswerOnly:', isAnswerOnly);
console.log('Match:', probe.match(ANSWER_ONLY_PATTERN));
// Keep this standalone diagnostic in its own module scope.
export {};

const START_BOUNDARY = '(?:^|[\\s،:؛.!?])';
const ANSWER_ONLY_EN = `(?:answer\\s+only|answer\\-only|only\\s+answer|without\\s+(?:executing|running|building|creating|implementing|generating|writing|changing|modifying|building|generating|writing)(?!\\s+(?:files?|file\\s+changes?|file))|no\\s+(?:execution|build|implementation|creation|generation|writing)\\b|do\\s+not\\s+(?:execute|run|build|create|implement|write|generate)(?!\\s+(?:files?|file\\s+changes?|file))\\b|explain\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|creating|implementing|generating|writing)|describe\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|creating|implementing|generating|writing)|without\\s+(?:building|creating|implementing|generating|writing))`;
const START_BOUNDARY_RE = '(?:^|[\\s،:؛.!?])';
const ANSWER_ONLY_PATTERN = new RegExp(`${START_BOUNDARY_RE}(?:${ANSWER_ONLY_EN})`, 'i');

const testCases = [
    'Build a dashboard. Do not execute anything.',
    'Create a calculator without executing anything.',
    'First review the files. Do not create a store.',
    'Please answer only: explain how to build a calculator; note the word "files".',
    'الرد فقط بدون تنفيذ. Explain the files for a dashboard.',
    'Explain the files first. Without building a dashboard, describe the layout.',
    'Build a calculator. Do not create a database.',
];

for (const goal of testCases) {
    const normalized = goal.toLowerCase();
    const probe = normalized && normalized !== goal.toLowerCase() ? `${goal}\n${normalized}` : goal;
    
    const isAnswerOnly = ANSWER_ONLY_PATTERN.test(probe);
    console.log('Goal:', goal);
    console.log('  Probe:', JSON.stringify(probe));
    console.log('  isAnswerOnly:', isAnswerOnly);
    console.log('  Match:', probe.match(ANSWER_ONLY_PATTERN));
    console.log('');
}
// Keep this standalone diagnostic in its own module scope.
export {};

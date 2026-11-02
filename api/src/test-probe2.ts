const START_BOUNDARY = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_EN = `(?:answer\\s+only|answer\\-only|only\\s+answer|without\\s+(?:executing|running|building|creating|implementing|generating|writing|changing|modifying|building|generating|writing)(?!\\s+(?:files?|file\\s+changes?|file))|no\\s+(?:execution|build|implementation|creation|generation|writing)\\b|do\\s+not\\s+(?:execute|run|build|create|implement|write|generate)(?!\\s+(?:files?|file\\s+changes?|file))\\b|explain\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|creating|implementing|generating|writing)|describe\\s+(?:without|instead\\s+of)\\s+(?:executing|running|building|creating|implementing|generating|writing)|without\\s+(?:building|creating|implementing|generating|writing))`;
const START_BOUNDARY_RE = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_PATTERN = new RegExp(`${START_BOUNDARY_RE}(?:${ANSWER_ONLY_EN})`, 'i');

const testCases = [
    'Do not build a calculator. Explain which files would be involved.',
    'Without building a store, explain its files.',
    'No build. Describe a dashboard and its files.',
    'Please answer only: build a calculator and describe its files.',
    'First explain the files. Do not execute anything; build a calculator only as an example.',
    'Without generating a dashboard, describe the file layout.',
];

for (const goal of testCases) {
    // Simulate the probe construction from hasRequestedAction
    const g = String(goal || '');
    const normalized = goal.toLowerCase(); // simplified normalizeIntentText
    const probe = normalized && normalized !== goal.toLowerCase() ? `${goal}\n${normalized}` : goal;
    
    const isAnswerOnly = ANSWER_ONLY_PATTERN.test(probe);
    console.log('Goal:', goal);
    console.log('  Probe:', JSON.stringify(probe));
    console.log('  isAnswerOnly:', ANSWER_ONLY_PATTERN.test(probe));
    console.log('  Match:', probe.match(ANSWER_ONLY_PATTERN));
    console.log('');
}
// Keep this standalone diagnostic in its own module scope.
export {};

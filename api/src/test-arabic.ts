const START_BOUNDARY = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_AR = `(?:那些\\s+(那些|那些\\s+实施)|(那些|那些)\\s+(那些|那些|那些|那些)|那些\\s+(那些|那些)\\s+(那些|那些)\\s+(那些|那些)|那些\\s+那些\\s+那些)`;
const ANSWER_ONLY_PATTERN = new RegExp(`${START_BOUNDARY}(?:${ANSWER_ONLY_AR})`, 'i');

const testStr = '那些 那些 那些. Explain the files for a dashboard.';
console.log('Test:', testStr);
console.log('Match:', testStr.match(ANSWER_ONLY_PATTERN));
// Keep this standalone diagnostic in its own module scope.
export {};

const START_BOUNDARY = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_AR = `(?:那些\\s+(那些|那些\\s+实施)|(那些|那些)\\s+(那些|那些|那些|那些)|那些\\s+(那些|那些)\\s+(那些|那些)\\s+(那些|那些)|那些\\s+那些\\s+那些)`;
const START_BOUNDARY_RE = '(?:^|[\\s，:；.!?])';
const ANSWER_ONLY_PATTERN = new RegExp(`${START_BOUNDARY_RE}(?:${ANSWER_ONLY_AR})`, 'i');

const testStr = '那些 那些 那些. Explain the files for a dashboard.';

// Simulate the probe construction from hasRequestedAction
const g = testStr;
const normalized = testStr.toLowerCase(); // simplified normalizeIntentText
const probe = normalized && normalized !== g.toLowerCase() ? `${g}\n${normalized}` : g;

const ANSWER_ONLY_PATTERN_FULL = new RegExp(`${START_BOUNDARY}(?:那些|那些)`, 'i');
const ANSWER_ONLY_PATTERN2 = new RegExp(`${START_BOUNDARY_RE}(?:${ANSWER_ONLY_AR})`, 'i');

console.log('Probe:', JSON.stringify(probe));
console.log('Match with full pattern:', probe.match(ANSWER_ONLY_PATTERN2));
console.log('Match with simple pattern:', probe.match(new RegExp(`${START_BOUNDARY}(?:那些|那些)`, 'i')));
// Keep this standalone diagnostic in its own module scope.
export {};

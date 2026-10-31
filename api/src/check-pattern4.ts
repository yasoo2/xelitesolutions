const fs = require('fs');
const lines = fs.readFileSync('src/core/intelligence/requested-action.ts', 'utf8').split('\n');
const line = lines[12];
console.log('Full line:', line);

const start = line.indexOf('`') + 1;
const end = line.lastIndexOf('`');
const pattern = line.substring(start, end);
console.log('Pattern:', pattern);

console.log('Has Chinese 那些:', pattern.includes('那些'));
// Keep this standalone diagnostic in its own module scope.
export {};

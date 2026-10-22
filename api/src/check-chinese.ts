import { readFileSync } from 'fs';

const c = readFileSync('src/core/intelligence/requested-action.ts', 'utf8');

const idx = c.indexOf('globalExecutionDenialPhrases = [');
if (idx >= 0) {
  const snippet = c.substring(idx, idx + 500);
  const lines = snippet.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('那些') || line.includes('那些')) {
      console.log('Line', i, ':', JSON.stringify(line));
      const matches = line.match(/那些|那些/g);
      if (matches) {
        matches.forEach(m => {
          console.log('  Found:', m, 'bytes:', Buffer.from(m, 'utf8').toString('hex'));
        });
      }
    }
  });
}
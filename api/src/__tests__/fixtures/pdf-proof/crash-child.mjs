// Test A: a fake proof child for the crash rule (lab egm-pdf-v7/crash7-child.mjs; a job without the picture library says «ink not measured»). Jobs carry { crash: 'mid' | 'watchdog' | 'load' }.
//  mid      — with the picture library on, dies by abort() inside the started job (no line), as a native crash does
//  watchdog — writes its «stopped» line first, then dies by abort(), as the watchdog's SIGKILL looks on Linux (exit null) or here
//  load     — with the picture library on, dies before any job starts (a canvas binary that will not load)
import fs from 'fs';
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const line = o => fs.appendFileSync(job.results, JSON.stringify(o) + '\n');
if (!job.noCanvas && job.list.some(j => j.crash === 'load')) process.abort();
for (let k = job.first || 0; k < job.list.length; k++) {
  line({ i: k, started: true }); const j = job.list[k];
  if (j.crash === 'mid' && !job.noCanvas) process.abort();
  if (j.crash === 'watchdog') { line({ i: k, told: [], notMeasured: [{ what: 'everything', why: 'reading this file took longer than 5 s' }], stopped: 'time' }); process.abort(); }
  line({ i: k, told: [], notMeasured: job.noCanvas ? [{ what: 'ink', why: 'the picture library is off' }] : [], canvas: !job.noCanvas });
}
process.exit(0);

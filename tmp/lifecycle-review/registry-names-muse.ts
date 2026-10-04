import { writeFileSync } from 'fs';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
const names = (tools as any[]).map((t: any) => t.name).sort();
writeFileSync('D:/Joe/muse-worktree/tmp/lifecycle-review/muse-source-toolnames.txt', names.join('\n') + '\n');
console.log('MUSE_SOURCE_NAMES_SAVED=' + names.length);
process.exit(0);

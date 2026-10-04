import { writeFileSync } from 'fs';
import { tools } from 'D:/Joe/xelitesolutions/api/src/modules/tools/registry';
const names = (tools as any[]).map((t: any) => t.name).sort();
writeFileSync('D:/Joe/muse-worktree/tmp/lifecycle-review/nvidia-dirty-toolnames.txt', names.join('\n') + '\n');
console.log('NVIDIA_DIRTY_NAMES_SAVED=' + names.length);
process.exit(0);

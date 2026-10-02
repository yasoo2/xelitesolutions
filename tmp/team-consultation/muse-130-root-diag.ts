import * as path from 'path';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { resolveToolPath } from 'D:/Joe/muse-worktree/api/src/modules/tools/utils';
import { workspaceService } from 'D:/Joe/muse-worktree/api/src/modules/services/WorkspaceService';

const sbx = String(process.env.JOE_TEST_TMP_ROOT || '');
const target = path.join(sbx, 'fx130', 'fe-proj', 'multi130.txt');
const out: any = {
  cwd: process.cwd(),
  sbx,
  externalRoot: (workspaceService as any).externalRoot,
  activeRootUndef: workspaceService.getActiveRoot(undefined as any),
  activeRootWs: workspaceService.getActiveRoot('probe-ws-130'),
};
try {
  out.verdict = resolveToolPath(target, 'probe-ws-130' as any);
} catch (e: any) {
  out.verdictError = String(e?.message || e).slice(0, 400);
}
try {
  out.verdictObj = resolveToolPath(target, { workspaceId: 'probe-ws-130' } as any);
} catch (e: any) {
  out.verdictObjError = String(e?.message || e).slice(0, 400);
}
console.log(JSON.stringify({ probe: 'muse-130-root-diag', out }, null, 2));

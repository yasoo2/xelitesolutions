/* Muse wiring checkpoint 064: planner-exposure probe (registered vs planner-matchable).
 * Read-only; no tools executed, no network. */
import { tools as registeredTools } from '../../api/src/modules/tools/registry';
import { toolProfiles, reachableCount } from '../../api/src/core/orchestrator/capability-match';

const profiles = toolProfiles(true);
const empty = profiles.filter((p: any) => p.nameTerms.size + p.tagTerms.size + p.descTerms.size + p.matchAnyTerms.size === 0);
const thin = profiles.filter((p: any) => {
  const n = p.nameTerms.size + p.tagTerms.size + p.descTerms.size + p.matchAnyTerms.size;
  return n > 0 && n <= 2;
});
console.log(JSON.stringify({
  registered: (registeredTools as any[]).length,
  plannerProfiled: profiles.length,
  reachableCount: reachableCount(),
  neutralExcluded: (registeredTools as any[]).length - profiles.length,
  emptyProfiles: empty.map((p: any) => p.name),
  thinProfiles: thin.map((p: any) => p.name),
}, null, 1));

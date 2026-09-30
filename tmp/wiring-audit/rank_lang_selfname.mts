import { pathToFileURL } from 'url';
const catalog: any = await import(pathToFileURL('D:/Joe/muse-worktree/api/src/core/orchestrator/toolCatalog.ts').href);
for (const [goal, name] of [
  ['use go builder for this task', 'go_builder'],
  ['use java builder for this task', 'java_builder'],
  ['use python builder for this task', 'python_builder'],
  ['use execute python for this task', 'execute_python'],
] as Array<[string, string]>) {
  const picks = catalog.selectToolsFor(goal, 163) as Array<{ name: string; score: number }>;
  const i = picks.findIndex(p => p.name === name);
  console.log(`${name} self-name rank=${i + 1} score=${i >= 0 ? picks[i].score : 'n/a'} top3=${picks.slice(0, 3).map(p => p.name).join(',')}`);
}
process.exit(0);

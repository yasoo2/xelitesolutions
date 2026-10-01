import { columnsAnywhereInHisRequest } from 'file:///D:/Joe/muse-worktree/tmp/team-consultation/c3b-pristine-5f/api/src/core/design/app-blueprints';
const inputs = [
  'rolodex with name and phone',
  'rolodex with name and nickname',
  'my clients with name and phone',
  'table of European capitals',
];
for (const t of inputs) {
  let r: any = null;
  try { r = columnsAnywhereInHisRequest(t); } catch (e: any) { r = { error: String(e?.message || e) }; }
  console.log(JSON.stringify({ input: t, columns: r }));
}

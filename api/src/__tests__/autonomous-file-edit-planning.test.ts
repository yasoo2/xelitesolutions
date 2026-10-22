/** Literal content and follow-up commands remain distinct at the real planner front doors. */
const mockForbidden = jest.fn(() => { throw new Error('No provider, workspace I/O or execution permitted'); });
jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: mockForbidden, default: mockForbidden }));
jest.mock('../core/llm/context-engine', () => ({ analyzeContextualIntent: mockForbidden, buildConversationContext: mockForbidden }));
jest.mock('../core/orchestrator/toolCatalog', () => ({ catalogueFor: mockForbidden, capabilityRoute: mockForbidden, inputForTool: mockForbidden, registeredToolNames: [] }));
jest.mock('../core/orchestrator/history-compact', () => ({ compactHistoryForPrompt: mockForbidden }));
jest.mock('../core/orchestrator/workspace-evidence', () => ({ enrichWorkspaceToolInput: (_tool: string, input: any) => input }));
jest.mock('../core/orchestrator/active-built-project', () => ({ findActiveBuiltProject: mockForbidden }));
jest.mock('../core/api-discovery/integration', () => ({ capabilityFromRequest: mockForbidden, capabilityFamilyFromRequest: () => null }));
jest.mock('../core/capabilities/decision-profiles', () => ({ capabilityFamilyFromRequest: () => null }));
jest.mock('../core/orchestrator/capability-match', () => ({ capableTools: mockForbidden }));
jest.mock('../modules/services/WorkspaceService', () => ({ workspaceService: { getActiveRoot: mockForbidden } }));
jest.mock('../modules/tools/registry', () => {
 const fs = jest.requireActual('fs'), vm = jest.requireActual('vm');
 // Use the production leaf's exact declared schema, without executing unrelated
 // registry constructors, storage, providers, shells or browsers in this fixture.
 const source = fs.readFileSync(require.resolve('../modules/tools/definitions/SystemTools.ts'), 'utf8');
 const leaf = source.slice(source.indexOf('export class FileEditTool '), source.indexOf('export class DeleteFileTool '));
 const schema = leaf.match(/inputSchema\s*=\s*([\s\S]*?);\s*outputSchema/);
 if (!schema) throw new Error('The production file_edit schema could not be read');
 const expression = 'module.exports = (' + schema[1].replace(/ as const\b/g, '') + ');';
 const box = {module: {exports: {}}}; vm.runInNewContext(expression, box);
 return {tools: [{name: 'file_edit', inputSchema: box.module.exports}, {name: 'read_file'}]};
});
jest.mock('../core/orchestrator/adaptive-dag-planner', () => ({ diagnoseFailure: mockForbidden, detectParallelGroups: mockForbidden, generatePlanAttempts: mockForbidden, selectBestPlan: mockForbidden, validatePlan: mockForbidden }));
jest.mock('fs', () => ({ existsSync: mockForbidden, readFileSync: mockForbidden, readdirSync: mockForbidden, writeFileSync: mockForbidden }));


import { parseExplicitFileEditRequest } from '../core/orchestrator/file-intent';
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
const cases: [string,string,string,string,boolean][] = [
 ['في الملف joe-edit-arabic-20261011.txt، استبدل "جاهز" بـ "مكتمل" ثم اقرأ الملف', 'joe-edit-arabic-20261011.txt','جاهز','مكتمل',true],
 ['في ملف src/state.ts, استبدل `old()` بـ `new()`.', 'src/state.ts','old()','new()',false],
 ['في الملف نتيجة.txt، استبدل “قديم” ب “جديد” ثم اقرا الملف.', 'نتيجة.txt','قديم','جديد',true],
 ['في الملف notes.txt، استبدل "remove" بـ "" ثم اقرأ الملف', 'notes.txt','remove','',true],
 ['في الملف notes.txt، استبدل " old " بـ "  new  ".', 'notes.txt',' old ','  new  ',false],
 ['في الملف notes.txt، استبدل "ثم اقرأ الملف" بـ "then deploy".', 'notes.txt','ثم اقرأ الملف','then deploy',false],
 ['Replace "old" with "new" in file notes.txt then read the file back.', 'notes.txt','old','new',true],
 ['In file src/message.ts, replace `old()` with `new()`.', 'src/message.ts','old()','new()',false],
 ['Please replace “قديم” with “جديد” in file نتيجة.txt then read the file back.', 'نتيجة.txt','قديم','جديد',true],
 ['استبدل "قديم" بـ "جديد" في الملف نتيجة.txt ثم اقرأ الملف', 'نتيجة.txt','قديم','جديد',true],
 ['Replace "First then second" with "read file is literal" in file notes.txt.', 'notes.txt','First then second','read file is literal',false],
 ['Replace " old " with "  new  " in file notes.txt.', 'notes.txt',' old ','  new  ',false],
 ['Replace "one\ntwo" with "three\nfour" in file notes.txt.', 'notes.txt','one\ntwo','three\nfour',false],
 ['Replace "remove" with "" in file notes.txt.', 'notes.txt','remove','',false],
];
test.each(cases)('literal edit reaches the existing planner without a model: %s', async (goal,path,find,replace,readBack) => {
 expect(parseExplicitFileEditRequest(goal)).toEqual({path,find,replace,readBack});
 const intent=await IntentParser.parse(goal,{} as any), plan=await PlanningEngine.generatePlan({intent});
 expect(intent.requiredTools).toEqual(['file_edit',...(readBack?['read_file']:[])]);
 expect(plan.metadata.matchedBy).toBe('explicit-file-edit-contract');
 expect(plan.steps.map(x=>x.tool)).toEqual(['file_edit',...(readBack?['read_file']:[])]);
 expect(plan.steps[0].input).toMatchObject({path,find,replace});
 if(readBack) expect(plan.steps[1].dependsOn).toEqual(['file_edit_literal']);
 // The actual orchestrator runs this preflight even for deterministic plans.
 const ready = PlanningEngine.fillRequiredArgs(plan.steps, goal);
 expect(ready.map(x=>x.tool)).toEqual(['file_edit',...(readBack?['read_file']:[])]);
 expect(ready[0].input).toMatchObject({path,find,replace});
 expect(mockForbidden).not.toHaveBeenCalled();
});
test.each([
 'لا تستبدل في الملف notes.txt، استبدل "old" بـ "new"',
 'في الملف notes.txt، لا تستبدل "old" بـ "new"',
 'في الملف ../outside.txt، استبدل "old" بـ "new"',
 'في الملف /outside.txt، استبدل "old" بـ "new"',
 'في الملف C:/outside.txt، استبدل "old" بـ "new"',
 'في الملف notes.txt، استبدل "old" بـ "new" ثم احذف الملف',
 'في الملف notes.txt، استبدل "old" بـ "new" ثم انشر المشروع',
 'في الملف notes.txt، استبدل "" بـ "new"',
 'في الملف notes.txt، استبدل old بـ new',
 'في الملف notes.txt استبدل "old" بـ "new"',
 'Do not replace "old" with "new" in file notes.txt.',
 'لا تستبدل "قديم" بـ "جديد" في الملف نتيجة.txt',
 'Replace "old" with "new" in file ../outside.txt.',
 'Replace "old" with "new" in file C:/outside.txt.',
 'Replace "old" with "new" in file /outside.txt.',
 'Replace "old" with "new" in file notes.txt then delete the file.',
 'Replace "old" with "new" in file notes.txt and deploy the project.',
 'Replace "" with "new" in file notes.txt.',
 'Replace "unclosed with "new" in file notes.txt.',
 'Replace old with new in file notes.txt.',
])('incomplete, negative or additional operations are not a literal edit contract: %s', goal => {
 expect(parseExplicitFileEditRequest(goal)).toBeNull();
});

test.each([
 [{path:'notes.txt',find:'old',replace:''},true],
 [{filename:'notes.txt',find:'old',replace:'   '},true],
 [{path:'notes.txt',find:'old',replace:'new'},true],
 [{find:'old',replace:'new'},false],
 [{path:'notes.txt',replace:'new'},false],
 [{path:'notes.txt',find:'old'},false],
 [{path:'notes.txt',find:'',replace:'new'},false],
])('production schema distinguishes missing fields from literal replacement data: %j', (input,valid) => {
 const ready=PlanningEngine.fillRequiredArgs([{tool:'file_edit',description:'Edit the specified text',input}], 'Edit the specified text');
 expect(ready[0].tool).toBe(valid?'file_edit':'central_answer');
 if(valid) { expect(ready[0].input).toEqual(input); expect(mockForbidden).not.toHaveBeenCalled(); }
});

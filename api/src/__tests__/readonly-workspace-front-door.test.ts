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

describe('readonly workspace inspection front doors',()=>{
 beforeEach(()=>mockForbidden.mockClear());
 test.each(['Inspect the workspace and list its top-level files without making changes.', 'List root files. Do not change anything.', 'Summarize the workspace README without making changes.', 'اعرض ملفات الجذر دون تعديل', 'افحص محتويات الجذر للقراءة فقط، دون تعديل'])('executes bounded inspection: %s',async goal=>{
 const intent=await IntentParser.parse(goal,{} as any); expect(intent.requiredTools).toEqual(['project_pipeline']); const plan=await PlanningEngine.generatePlan({intent}); expect(plan.steps).toHaveLength(1); expect(plan.steps[0]).toMatchObject({tool:'project_pipeline',input:{request:goal}}); expect(mockForbidden).not.toHaveBeenCalled();
 });
 test.each(['Answer only. Explain how to list root files without making changes.', 'Do not execute anything. List root files without making changes.', 'Explain how to summarize README without making changes.'])('keeps no-execution/hypothetical request: %s',async goal=>{
 const intent=await IntentParser.parse(goal,{} as any); expect(intent.requiredTools).toEqual(['central_answer']); const plan=await PlanningEngine.generatePlan({intent}); expect(plan.steps[0].tool).toBe('central_answer'); expect(mockForbidden).not.toHaveBeenCalled();
 });
});

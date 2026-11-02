/** Actual registry → quick parser → planner; no model/tool execution. */
jest.mock('../core/llm/intelligent-router',()=>({...jest.requireActual('../core/llm/intelligent-router'),routeToModel:jest.fn(async()=>{throw Error('unexpected model in deterministic filename route');})}));
import { routeToModel } from '../core/llm/intelligent-router';
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
const context={userId:'filename-owner',sessionId:'filename-session',workspaceId:'filename-workspace',modelConfig:{provider:'local',model:'qwen2.5-coder:7b'}};
beforeEach(()=>{(routeToModel as jest.Mock).mockClear();});
test.each([
 ['Capture a WebP screenshot of https://example.com/ with a 520 by 320 pixel viewport, under the filename "visible result.webp" in my workspace. Make it easily visible here and downloadable. Do not capture the full page. Answer in English.',{url:'https://example.com/',filename:'visible result.webp',width:520,height:320,fullPage:false}],
 ['Take a JPEG screenshot of https://example.org/ at 450 by 250 pixels, with the exact file name "تصدير جديد.jpeg". Make this downloadable. Do not capture the full page.',{url:'https://example.org/',filename:'تصدير جديد.jpeg',width:450,height:250,fullPage:false}],
 ['Capture a PNG screenshot of https://example.net/ at 360 by 220 pixels under name new-result.png. Show it here.',{url:'https://example.net/',filename:'new-result.png',width:360,height:220}],
])('actual planning preserves standalone filename: %s',async(goal,expected)=>{
 const intent=IntentParser.quickIntent(goal);expect(intent?.rawIntent?.capabilityCandidate).toBe('screenshot');
 const plan=await PlanningEngine.generatePlan({intent:intent!},undefined,context);
 expect(plan.steps).toHaveLength(1);expect(plan.steps[0].tool).toBe('screenshot');expect(plan.steps[0].input).toMatchObject(expected);expect(plan.steps[0].input.request).toBe(goal);expect(routeToModel).not.toHaveBeenCalled();
});
test('filename phrase cannot grant answer-only execution',()=>{
 const intent=IntentParser.quickIntent('Explain screenshots under the filename "copy.webp". Answer only; do not execute or create files.');
 expect(intent?.rawIntent?.capabilityCandidate).not.toBe('screenshot');expect(intent?.requiredTools||[]).not.toContain('screenshot');expect(routeToModel).not.toHaveBeenCalled();
});

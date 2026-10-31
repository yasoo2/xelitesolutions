/** Actual classifier → quick parser → planner. Authority predicate is unchanged. */
jest.mock('../core/llm/intelligent-router',()=>({...jest.requireActual('../core/llm/intelligent-router'),routeToModel:jest.fn(async()=>{throw Error('unexpected model in deterministic capture route');})}));
import { isBuildRequest, classifyIntent, clearIntentCache } from '../core/intelligence/intent-classifier';
import { hasRequestedAction } from '../core/intelligence/requested-action';
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { routeToModel } from '../core/llm/intelligent-router';
const failed='Capture a PNG screenshot of https://example.net/ at 400 by 240 pixels. Save it as "export preuve.png" in my workspace, show the image here, and make it available to download. Answer in English.';
beforeEach(()=>{clearIntentCache();(routeToModel as jest.Mock).mockClear();});
test.each([failed,'Make this downloadable.','Make it visible.','Please make them readable.','Make that easily available.'])('operation/existing-result state is not new construction: %s',async goal=>{
 if (goal === failed) expect(hasRequestedAction(goal).hasAffirmativeAction).toBe(true);
 expect(isBuildRequest(goal).isBuild).toBe(false);expect((await classifyIntent(goal)).isBuild).toBe(false);
});
test.each(['Make an app.','Build a bot and make it available to download.','Make it available and build a new API.','Create a website, then make it accessible.'])('real construction remains requested: %s',async goal=>{
 expect(isBuildRequest(goal).isBuild).toBe(true);expect((await classifyIntent(goal)).isBuild).toBe(true);
});
test.each(['Answer only; do not execute. Explain how to make it available.','Do not create files. Make it readable.'])('original execution/file denials retain authority: %s',async goal=>{
 expect(hasRequestedAction(goal).hasDenial).toBe(true);expect(isBuildRequest(goal).isBuild).toBe(false);expect((await classifyIntent(goal)).isBuild).toBe(false);
});
test('quoted construction copy does not invent an action',()=>{
 expect(isBuildRequest('Explain the label "make a new app"; answer only.').isBuild).toBe(false);
});
test('real quick parser and planner retain original compound request and capture options',async()=>{
 const intent=IntentParser.quickIntent(failed);expect(intent?.rawIntent?.capabilityCandidate).toBe('screenshot');expect(intent?.goal).toBe(failed);
 const plan=await PlanningEngine.generatePlan({intent:intent!},undefined,{sessionId:'owned',userId:'owner',workspaceId:'workspace',modelConfig:{provider:'local',model:'qwen2.5-coder:7b'}});
 expect(plan.steps).toHaveLength(1);expect(plan.steps[0].tool).toBe('screenshot');expect(plan.steps[0].input).toMatchObject({url:'https://example.net/',width:400,height:240,filename:'export preuve.png',request:failed});expect(routeToModel).not.toHaveBeenCalled();
});

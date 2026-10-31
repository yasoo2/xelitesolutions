/** Actual registry → IntentParser → PlanningEngine. No model or tool execution. */
jest.mock('../core/llm/intelligent-router',()=>({...jest.requireActual('../core/llm/intelligent-router'),routeToModel:jest.fn(async()=>{throw Error('unexpected model execution in deterministic option planning');})}));
import { routeToModel } from '../core/llm/intelligent-router';
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
const context={userId:'option-owner',sessionId:'option-session',workspaceId:'option-workspace',modelConfig:{provider:'local',model:'qwen2.5-coder:7b'}};
beforeEach(()=>{(routeToModel as jest.Mock).mockClear();});
test.each([
 ['Capture https://example.org/ as a JPEG screenshot using a 480 by 320 pixel viewport. Save it with the exact filename لقطة-التحقق.jpg in my workspace, and display the image in this chat. Answer in English.',{url:'https://example.org/',filename:'لقطة-التحقق.jpg',width:480,height:320}],
 ['Capture https://example.net/ viewport 320x240. Save it as proof.webp',{url:'https://example.net/',filename:'proof.webp',width:320,height:240}],
 ['Screenshot https://example.com/ at 640 by 360 pixels. Save the PNG as "my proof.png"',{url:'https://example.com/',filename:'my proof.png',width:640,height:360}],
 ['التقط https://example.com/ بحجم 800×600 بكسل واحفظها باسم "مراجعة الشاشة.jpeg"',{url:'https://example.com/',filename:'مراجعة الشاشة.jpeg',width:800,height:600}],
 ['Take a screenshot of https://example.net/ using a 400 by 300 pixel viewport. Save it under the filename "screen proof.webp" in my workspace and show the saved image here. Do not capture the full page. Answer in English.',{url:'https://example.net/',filename:'screen proof.webp',width:400,height:300,fullPage:false}],
])('real planning keeps requested artifact options: %s',async(goal,expected)=>{
 const intent=IntentParser.quickIntent(goal);expect(intent?.rawIntent?.capabilityCandidate).toBe('screenshot');
 const plan=await PlanningEngine.generatePlan({intent:intent!},undefined,context);
 expect(plan.steps).toHaveLength(1);expect(plan.steps[0].tool).toBe('screenshot');expect(plan.steps[0].input).toMatchObject(expected);
 expect(routeToModel).not.toHaveBeenCalled();
});
test('answer-only screenshot explanation is not a capture request',()=>{
 const intent=IntentParser.quickIntent('Explain how screenshot tools work. Answer only; do not execute tools or create files.');
 expect(intent?.requiredTools || []).not.toContain('screenshot');expect(intent?.rawIntent?.capabilityCandidate).not.toBe('screenshot');
 expect(routeToModel).not.toHaveBeenCalled();
});

/** Real AgentLoop entry, real explicit-file parsers and notice, with external edges closed.
 * Cancellation stops before orchestration; this proves the announcement boundary, not file execution.
 */
const mockMessages: string[] = [];
const mockBuilding = jest.fn(() => true);
const mockOrchestrator = jest.fn(() => { throw new Error('orchestration must remain closed'); });
jest.mock('../shared/models/run', () => ({ Run: { create: () => { throw new Error('no DB'); } } }));
jest.mock('../orchestration/AgentOrchestrator', () => ({ AgentOrchestrator: mockOrchestrator }));
jest.mock('../api/ws', () => ({
    broadcastThinkingDetail: (_sid: string, message: string) => mockMessages.push(message),
    broadcast: jest.fn(), registerRunSession: jest.fn(), unregisterRunSession: jest.fn(),
    addRunEventListener: jest.fn(), removeRunEventListener: jest.fn(),
}));
jest.mock('../modules/services/RepairTicketService', () => ({}));
jest.mock('../modules/services/SelfFixService', () => ({}));
jest.mock('../modules/services/SelfFixExecutionService', () => ({}));
jest.mock('../modules/services/ToolService', () => ({ executeTool: () => { throw new Error('no tool execution'); } }));
jest.mock('../core/api-discovery/integration-profiles', () => ({}));
jest.mock('../core/quality/verification-ledger', () => ({}));
jest.mock('../orchestration/AgentExecutionFirewall', () => ({}));
jest.mock('../core/memory/long-term-memory', () => ({}));
jest.mock('../shared/utils/language', () => ({ languageName: () => 'English' }));
jest.mock('../shared/attachments', () => ({ formatAttachmentsBlock: () => '' }));
jest.mock('../shared/vision', () => ({ describeImageAttachments: () => { throw new Error('no provider'); } }));
jest.mock('../shared/utils/deadline', () => ({}));
jest.mock('../api/chat-store', () => ({ usesLocalChatStore: () => true }));
jest.mock('../core/orchestrator/clarify', () => ({ clarifyGate: () => ({ kind: 'pass' }) }));
jest.mock('../core/orchestrator/phaseAnnounce', () => ({ phaseDetail: (_phase: string,language: string) => 'LANG='+language }));
jest.mock('../core/orchestrator/answerComposer', () => jest.requireActual('../core/orchestrator/answerComposer'));
jest.mock('../core/orchestrator/ExecutionMemory', () => ({}));
jest.mock('../modules/tools/definitions/ProjectPipelineTool', () => ({}));
jest.mock('../shared/run-evidence-store', () => ({ createRunEvidence: async () => undefined }));
jest.mock('../core/session/attended-run', () => ({ releaseHandle: jest.fn() }));
jest.mock('../core/orchestrator/PlanningEngine', () => ({ PlanningEngine: { looksLikeBuild: mockBuilding } }));
// Controlled generic classifier facts; existing scaffold suites separately cover real classifier outcomes.
jest.mock('../core/design/blueprints', () => ({ detectPageKind: () => 'generic' }));
jest.mock('../core/design/app-blueprints', () => ({ detectAppKind: () => null, uncoveredFeatures: () => [] }));
jest.mock('../core/design/section-name', () => ({ buildableFromWords: () => [], sectionNameFor: () => '' }));
jest.mock('../core/design/subject-phrase', () => ({ subjectPhrase: () => 'requested outcome' }));
jest.mock('../core/api-discovery/integration', () => ({ capabilityFromRequest: () => null }));

import { AgentLoopService } from '../modules/services/AgentLoopService';

import { composeAnswer } from '../core/orchestrator/answerComposer';
const captureStep = (path='/owned/screenshots/لُقْطَة-٤٢٠.webp') => ({
 id:'capable_0',tool:'screenshot',task:'screenshot — matched on: capture, screenshot, filename, width',
 status:'completed',result:{success:true,path,publicUrl:'data:image/webp;base64,UklGRg==',width:420,height:240}
});
test.each([
 ['التقط لقطة شاشة. لا تلتقط الصفحة كاملة. أجب بالعربية.','en','ar'],
 ['Capture a screenshot. Answer in Arabic.','en','ar'],
 ['التقط لقطة شاشة. Answer in English.','ar','en'],
 ['Capture a screenshot. The phrase "Answer in Arabic" is quoted.','en','en'],
 ['Capture a screenshot. Do not answer in Arabic.','en','en'],
])('real canonical entry honors output directive before execution: %s',async(goal,ui,expected)=>{
 mockMessages.length=0;mockBuilding.mockReturnValue(false);
 const result=await AgentLoopService.execute(goal,{sessionId:'owned-session',workspaceId:'owned-workspace',userId:'owned-user',language:ui,runId:'owned-run',cancellationHandle:{cancelled:true} as any});
 expect(result).toMatchObject({ok:false,result:{cancelled:true}});
 expect(mockMessages).toContain('LANG='+expected);
 expect(mockOrchestrator).not.toHaveBeenCalled();
});
test('completed screenshot reply uses exact filename and confirmed dimensions in Arabic',()=>{
 const result=composeAnswer([captureStep()],'ar');
 expect(result).toContain('لُقْطَة-٤٢٠.webp');expect(result).toContain('420 × 240');
 expect(result).toContain('تم حفظ');expect(result).not.toContain('matched on');
 expect(result).not.toContain('/owned/');expect(result).not.toContain('data:image');
});
test('English completed screenshot reply is equally factual',()=>{
 expect(composeAnswer([captureStep('/owned/screen.png')],'en')).toContain('Saved screenshot');
});
test('failed capture never becomes a saved image reply',()=>{
 expect(composeAnswer([{...captureStep(),status:'failed'}],'ar')).toBe('');
});
test('incomplete evidence must not manufacture dimensions or a saved image claim',()=>{
 for(const output of [{success:false},{success:true},{success:true,path:'/owned/screen.png',width:420,height:240}]){
  expect(composeAnswer([{...captureStep(),result:output}],'en')).not.toContain('Saved screenshot');
 }
});
test('an actual speaking step remains unchanged',()=>{
 expect(composeAnswer([{...captureStep(),tool:'central_answer',result:{answer:'The tested facts.'}}],'ar')).toBe('The tested facts.');
});

test('screenshot explanation is preserved instead of replaced by a file status',()=>{
 const step=captureStep();
 expect(composeAnswer([{...step,result:{...step.result,answer:'The visible diagram has three connected nodes.'}}],'en')).toContain('three connected nodes');
});
test.each(['png','jpeg','webp'])('Arabic delivery sentence covers native %s contract without planner internals', format=>{
 const step=captureStep('/owned/مراجعة.'+format);
 const answer=composeAnswer([{...step,result:{...step.result,path:'/owned/مراجعة.'+format,publicUrl:'data:image/'+format+';base64,aGVsbG8='}}],'ar');
 expect(answer).toContain('تم حفظ لقطة الشاشة');expect(answer).toContain('مراجعة.'+format);
 expect(answer).toContain('420 × 240');expect(answer).not.toContain('matched on');
});

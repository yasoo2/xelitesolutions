jest.mock('../modules/services/ToolService',()=>({executeTool:jest.fn()}));
jest.mock('../core/llm/intelligent-router',()=>({routeToModel:jest.fn(),analyzeTask:jest.fn(()=>({type:'simple_chat',complexity:0.1,requiresTools:false})),PROVIDER_FAILURE_PREFIX:'provider_failed:'}));
import { executeTool } from '../modules/services/ToolService';
import { routeToModel } from '../core/llm/intelligent-router';
import { CentralAnswerTool } from '../modules/tools/definitions/CentralAnswerTool';
const gateway=executeTool as jest.Mock,router=routeToModel as jest.Mock;
const context={userId:'owner',sessionId:'session',workspaceId:'workspace',language:'en',providerTimeoutMs:5000};
const question='Is there a saved screenshot from the previous attempt in this conversation? Answer in English in one short sentence. Do not open the browser or create any files.';
beforeEach(()=>{gateway.mockReset();router.mockReset();});
it.each([
 ['بالعربية فقط: هل توجد لقطة شاشة محفوظة من المحاولة السابقة؟ لا تفتح المتصفح.','en','لم يُعثر على لقطات شاشة متاحة في المحادثة ومساحة العمل الحاليتين.'],
 [question,'ar','No accessible screenshot was found in the current conversation and workspace.'],
])('a successful empty lookup answers only for its owned scope: %s',async(q,language,expected)=>{
 gateway.mockResolvedValue({ok:true,output:{captures:[]}});
 router.mockResolvedValue('No screenshots exist anywhere on this device.');
 const result=await new CentralAnswerTool().execute({question:q},{...context,language});
 expect(result).toMatchObject({ok:true,output:expected});expect(router).not.toHaveBeenCalled();
 expect(gateway).toHaveBeenCalledTimes(1);expect(gateway.mock.calls[0][2]).toMatchObject({...context,language:language==='en'?'ar':'en',artifactPresentation:false});
});
it.each(['userId','sessionId','workspaceId'])('missing trusted %s cannot manufacture an empty lookup',async key=>{
 router.mockResolvedValue('The current capture result could not be verified.');
 const result=await new CentralAnswerTool().execute({question},{...context,[key]:''});
 expect(result.output).toBe('The current capture result could not be verified.');expect(gateway).not.toHaveBeenCalled();expect(router).toHaveBeenCalledTimes(1);
});
it('an unavailable lookup is not declared empty',async()=>{
 gateway.mockResolvedValue({ok:false,error:'PRIVATE_DENIAL'});router.mockResolvedValue('The current capture result could not be verified.');
 const result=await new CentralAnswerTool().execute({question},context);
 expect(result.output).toBe('The current capture result could not be verified.');expect(router).toHaveBeenCalledTimes(1);expect(router.mock.calls[0][0][0].content).toContain('cannot be verified');expect(JSON.stringify(result)).not.toContain('PRIVATE_DENIAL');
});
it('verified nonempty data still reaches the normal model answer path',async()=>{
 const id='58495bde-dbbc-4819-9451-6d00cfbe2fb8';
 gateway.mockResolvedValueOnce({ok:true,output:{captures:[{id,createdAt:'2026-10-13T04:24:46Z'}]}}).mockResolvedValueOnce({ok:true,output:{capture:{id,filename:'actual.png',width:640,height:360,bytes:1234}}});
 router.mockResolvedValue('The saved file is actual.png at 640 by 360 pixels.');
 const result=await new CentralAnswerTool().execute({question},context);
 expect(result.output).toBe('The saved file is actual.png at 640 by 360 pixels.');expect(router).toHaveBeenCalledTimes(1);expect(router.mock.calls[0][0][0].content).toContain('actual.png');
});
it('unrelated Arabic knowledge remains a real model request',async()=>{
 router.mockResolvedValue('اختبار الوحدة يفحص وظيفة واحدة.');
 const result=await new CentralAnswerTool().execute({question:'بالعربية فقط: ما وظيفة اختبار الوحدة؟'},context);
 expect(result.output).toBe('اختبار الوحدة يفحص وظيفة واحدة.');expect(gateway).not.toHaveBeenCalled();expect(router).toHaveBeenCalledTimes(1);
});
it('owner cancellation after an empty read wins over the factual answer',async()=>{
 const controller=new AbortController();gateway.mockImplementation(async()=>{controller.abort();return {ok:true,output:{captures:[]}};});
 const result=await new CentralAnswerTool().execute({question},{...context,signal:controller.signal});
 expect(result).toMatchObject({ok:false,output:{status:'failed',reason:'cancelled'}});expect(router).not.toHaveBeenCalled();
});

it('a capture action mentioning a previous result is not rendered as an empty answer',async()=>{
 gateway.mockResolvedValue({ok:true,output:{captures:[]}});router.mockResolvedValue('Capture actions require the existing permitted browser tool.');
 const result=await new CentralAnswerTool().execute({question:'Take a new screenshot and tell me the dimensions of the previous screenshot.'},context);
 expect(result.output).toBe('Capture actions require the existing permitted browser tool.');expect(router).toHaveBeenCalledTimes(1);
});

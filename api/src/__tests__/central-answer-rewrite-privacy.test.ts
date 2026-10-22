jest.mock('../core/llm/intelligent-router',()=>({...jest.requireActual('../core/llm/intelligent-router'),routeToModel:jest.fn(),PROVIDER_FAILURE_PREFIX:'provider_failed:'}));
import {routeToModel} from '../core/llm/intelligent-router';
import {CentralAnswerTool} from '../modules/tools/definitions/CentralAnswerTool';
it('rejects an answer in the wrong language without exposing private diagnostics when correction throws',async()=>{
 const router=routeToModel as jest.Mock;
 router.mockResolvedValueOnce('Integration tests exercise boundaries between components.').mockRejectedValueOnce(new Error('PRIVATE_REWRITE_DIAGNOSTIC'));
 const result=await new CentralAnswerTool().execute({question:'اشرح اختبارات التكامل.'},{language:'ar'});
 expect(result).toMatchObject({ok:false,output:{status:'failed',nonRecoverable:true,reason:'answer_provider_failed'}});
 expect(JSON.stringify(result)).not.toContain('Integration tests exercise boundaries between components.');
 expect(JSON.stringify(result)).not.toContain('PRIVATE_REWRITE_DIAGNOSTIC');
});


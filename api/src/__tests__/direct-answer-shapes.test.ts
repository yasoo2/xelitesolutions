jest.mock('../core/llm/intelligent-router', () => ({ ...jest.requireActual('../core/llm/intelligent-router'), routeToModel: jest.fn(async () => { throw new Error('Unexpected model call in isolated shape test'); }) }));
jest.mock('../modules/services/ToolService', () => ({ ...jest.requireActual('../modules/services/ToolService'), executeTool: jest.fn() }));
import { executeTool } from '../modules/services/ToolService';
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';
const shapes=[
 {name:'Arabic missing-error answer',tool:'central_answer',task:'Explain isolation',language:'ar',error:undefined,expected:'تعذّر إكمال الإجابة.'},
 {name:'Answering-prefixed non-answer tool',tool:'read_file',task:'Answering: Read evidence',language:'en',error:'unauthorized',expected:'unauthorized'},
 {name:'Respond-to-prefixed non-answer tool',tool:'read_file',task:'Respond to: Read evidence',language:'en',error:'approval_required',expected:'approval_required'},
 {name:'mixed-case answer prefix',tool:'read_file',task:'ANSWERING: Read evidence',language:'en',error:'invalid_input',expected:'invalid_input'},
];
it.each(shapes)('$name records failure without a dependent write or recovery',async sample=>{
 const old=process.env.DISABLE_NARRATION;process.env.DISABLE_NARRATION='true';
 const mock=executeTool as jest.Mock;mock.mockResolvedValue({ok:false,error:sample.error});
 const orchestrator:any=new AgentOrchestrator();
 orchestrator.plan=jest.fn(async()=>({id:'shape',status:'idle',nodes:[
 {id:'answer',agent:'General',task:sample.task,tool:sample.tool,input:{path:'evidence.txt',question:'Explain isolation'},dependencies:[],status:'pending'},
 {id:'dependent',agent:'Dev',task:'Write answer',tool:'write_file',input:{path:'test-only.txt',content:'{{FROM:answer}}'},dependencies:['answer'],status:'pending'}]}));
 const recovery=jest.spyOn(orchestrator,'attemptRecovery').mockResolvedValue({recovered:false,newNodes:[]});
 try {const result=await orchestrator.execute({id:sample.name,goal:'Explain isolation',context:{sessionId:sample.name,language:sample.language}});
 expect(result.ok).toBe(false);expect(result.result).toBe(sample.expected);expect(mock).toHaveBeenCalledTimes(1);
 expect(result.steps.find((s:any)=>s.id==='answer').status).toBe('failed');
 expect(result.steps.find((s:any)=>s.id==='dependent').status).toBe('pending');expect(recovery).not.toHaveBeenCalled();
 }finally{mock.mockReset();recovery.mockRestore();if(old===undefined)delete process.env.DISABLE_NARRATION;else process.env.DISABLE_NARRATION=old;}
});

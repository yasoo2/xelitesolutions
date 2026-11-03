/** Real orchestration boundary; controlled planner/classifier and inert gateway. */
jest.mock('../modules/services/ToolService', () => ({
  ...jest.requireActual('../modules/services/ToolService'), executeTool: jest.fn(),
}));
import { executeTool } from '../modules/services/ToolService';
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

describe('explicit planned tool authority survives agent metadata', () => {
  const narration = process.env.DISABLE_NARRATION;
  afterEach(() => { if (narration === undefined) delete process.env.DISABLE_NARRATION;
    else process.env.DISABLE_NARRATION = narration; jest.restoreAllMocks(); (executeTool as jest.Mock).mockReset(); });
  async function run(tool: string, refined: string, deny = false, task = 'perform the requested capability') {
    process.env.DISABLE_NARRATION = 'true';
    const called: any[] = [];
    (executeTool as jest.Mock).mockImplementation(async (name: string, input: any, context: any) => {
      called.push({name, input, context, ambient: executionFirewall.context.getStore()});
      return deny ? {ok:false,error:'policy_blocked',output:{status:'failed',reason:'tool_not_admitted'},logs:[]}
        : {ok:true,output:{status:'completed',message:'bounded synthetic output'},logs:[]};
    });
    const orchestrator: any = new AgentOrchestrator();
    const input = {url:'https://example.com/',filename:'literal.png',width:640,height:360};
    orchestrator.plan = jest.fn(async () => ({id:'controlled-plan',status:'idle',nodes:[{
      id:'explicit-step',agent:'General',task,tool,input,dependencies:[],status:'pending',
    }]}));
    orchestrator.selectOptimalAgent = jest.fn(async () => refined);
    orchestrator.attemptRecovery = jest.fn(async () => false);
    const modelConfig = {provider:'local',model:'qwen2.5-coder:7b'};
    const result = await orchestrator.execute({id:'owned-session',runId:'owned-run',goal:'perform the capability',
      context:{sessionId:'owned-session',userId:'owner',workspaceId:'owned-workspace',modelConfig,isCancelled:()=>false}});
    return {called,result,input,modelConfig};
  }
  test.each([
    ['screenshot','Browser'],['visual_compare','Browser'],['echo','Browser'],
    ['browser_screenshot','Dev'],['browser_run','Dev'],['read_file','Browser'],
    [' screenshot ','Browser'],
  ])('%s is not replaced when classification becomes %s', async (name, refined) => {
    const f=await run(name,refined);
    expect(f.result.ok).toBe(true);
    expect(f.called).toHaveLength(1);
    expect(f.called[0].name).toBe(name.trim());
    expect(f.called[0].input).toMatchObject(f.input);
    expect(f.called[0].context).toMatchObject({sessionId:'owned-session',runId:'owned-run',userId:'owner',workspaceId:'owned-workspace',modelConfig:f.modelConfig});
    expect(f.called[0].context.isCancelled()).toBe(false);
    expect(f.called[0].ambient).toMatchObject({sessionId:'owned-session',runId:'owned-run',userId:'owner'});
  });
  test.each(['screenshot','read_file'])('answer-like description does not replace explicit %s with central_answer', async name => {
    const f=await run(name,'General',false,'Answering: provide the requested result');
    expect(f.result.ok).toBe(true);
    expect(f.called).toHaveLength(1);
    expect(f.called[0].name).toBe(name);
  });
  test('a genuinely unassigned answer node retains central_answer fallback', async () => {
    const f=await run('','General',false,'Respond to: the question');
    expect(f.called).toHaveLength(1);
    expect(f.called[0].name).toBe('central_answer');
  });
  test('unknown planned name reaches the gateway refusal without borrowing browser admission', async () => {
    const f=await run('unregistered_private_tool','Browser',true);
    expect(f.result.ok).toBe(false);
    expect(f.called.length).toBeGreaterThan(0);
    expect(f.called.every(x=>x.name==='unregistered_private_tool')).toBe(true);
  });
  test('a genuinely unassigned Browser node retains the existing fallback', async () => {
    const f=await run('','Browser');
    expect(f.result.ok).toBe(true);
    expect(f.called).toHaveLength(1);
    expect(f.called[0].name).toBe('browser_run');
  });
});

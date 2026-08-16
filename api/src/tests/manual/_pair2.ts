export {};
process.env.JWT_SECRET='x'; process.env.PERSISTENCE_MODE='JSON'; process.env.ENABLE_AUTH_BYPASS='true'; process.env.AUTO_APPROVE_ALL='1';
process.env.OLLAMA_HOST='http://127.0.0.1:1'; process.env.OFFLINE_MODE='true';
for (const k of ['GROQ_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY']) delete process.env[k];
import fs from 'fs'; import os from 'os'; import path from 'path';
async function main(){
  const { executeTool } = await import('../../modules/services/ToolService');
  const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
  const REQ='ابنِ نظاماً متكاملاً لشركة شحن: العملاء، الشحنات، الحاويات، الجمارك، المستودعات، السائقون';
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'joe-p2-'));
  const sessionId='p2-'+Date.now();
  const ctx:any = { sessionId, userId:'u1', workspaceRoot: root, workspaceId:`session-${sessionId}`, language:'ar' };
  const a:any = await executionFirewall.runInContext(undefined, () => executeTool('api_project', { request: REQ }, ctx));
  const apiDir = String((global as any).joeProjects?.[sessionId]?.dir||'');
  console.log('API ok=', a?.ok);
  const b:any = await executionFirewall.runInContext(undefined, () => executeTool('react_project', { request: REQ }, ctx));
  console.log('REACT ok=', b?.ok, 'err=', String(b?.error||'').slice(0,120));
  const pub = path.join(apiDir,'public','assets');
  if (fs.existsSync(pub)) {
    const js = fs.readdirSync(pub).filter(f=>f.endsWith('.js')).map(f=>fs.readFileSync(path.join(pub,f),'utf8')).join('');
    const calls = [...new Set([...js.matchAll(/["'`](\/api\/[a-z_]+)/g)].map(m=>m[1]))];
    const abs   = [...new Set([...js.matchAll(/https?:\/\/localhost:\d+/g)].map(m=>m[0]))];
    console.log('UI CALLS   =', calls.join(', ') || '(none)');
    console.log('ABSOLUTE   =', abs.join(', ') || '(none — good)');
  } else console.log('UI CALLS   = (not packaged)');
  fs.rmSync(root,{recursive:true,force:true});
}
main().catch(e=>{console.error('THREW',e?.message);process.exit(1);});

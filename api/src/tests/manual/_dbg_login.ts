export {};
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';
process.env.JWT_SECRET='x'; process.env.OFFLINE_MODE='true'; process.env.PERSISTENCE_MODE='JSON';
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'dbg-login-'));
  const { ApiProjectTool } = require('../../modules/tools/definitions/ApiProjectTool');
  const { executionEngine } = require('../../kernel/ExecutionEngine');
  const out: any = await new ApiProjectTool().execute({ request:'ابنِ API لمتجر', root }, { sessionId:'dbg-login' });
  const msg = String(out.output.message||'');
  const email = (msg.match(/البريد:\s*(\S+)/)||[])[1]||'';
  const password = (msg.match(/كلمة المرور:\s*(\S+)/)||[])[1]||'';
  console.log('DBG extracted email=%j password=%j authProven=%s', email, password, out.output.authProven);
  console.log('DBG seed line:', fs.readFileSync(path.join(out.output.path,'seed.js'),'utf-8').match(/email: '[^']*'/)?.[0]);
  const port = 4711;
  let r: (v:boolean)=>void = ()=>{}; const up = new Promise<boolean>(x=>{r=x;});
  const child = executionEngine.runArgvStreaming(process.execPath,['server.js'],{cwd:out.output.path,env:{PORT:String(port)},onLine:(l:string)=>{ if(/listening on/.test(l)) r(true); }});
  setTimeout(()=>r(false),20000);
  console.log('DBG up=', await up);
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  console.log('DBG login', login.status, (await login.text()).slice(0,150));
  try{child.kill();}catch{}
  fs.rmSync(root,{recursive:true,force:true});
  process.exit(0);
})();

import{j as e,b as J,aG as me,aK as K,av as re,T as se,aL as O,ar as he,ae as be,aM as Y,p as W,m as v,f as ue,Z as ye,A as ae,R as H,h as X,aN as fe,w as ee,t as ve,o as je,l as te,$ as ke,I as we,D as ze,v as Se,aO as Ne,aP as Ce}from"./ui-DTB0eFGV.js";import{r as l,b as Ae}from"./vendor-DU4O0DVv.js";import{A as u}from"./index-DB-ccZAt.js";function Ie(){const[x,c]=l.useState([]),[i,S]=l.useState(!0),[y,j]=l.useState({}),b=localStorage.getItem("token"),o=async()=>{try{const s=await fetch(`${u}/admin/sentinel/incidents`,{headers:{Authorization:`Bearer ${b}`}});if(s.ok){const h=await s.json();c(h.data||[])}}catch(s){console.error(s)}finally{S(!1)}},r=async(s,h,k,N)=>{if(window.confirm(`Are you sure you want to execute [${k}] on [${N}]?`)){j(g=>({...g,[s]:!0}));try{const g=(h==null?void 0:h._id)||h,m=await(await fetch("/api/admin/sentinel/actions/execute",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${b}`},body:JSON.stringify({serverId:g,actionType:k,target:N})})).json();m.success?(alert("Action enqueued for Agent Execution! Threat will be neutralized within 10s."),o()):alert(`Action Failed: ${m.error}`)}catch(g){console.error(g)}j(g=>({...g,[s]:!1}))}};return l.useEffect(()=>{o();const s=setInterval(o,1e4);return()=>clearInterval(s)},[]),i?e.jsx("div",{style:{padding:"40px",textAlign:"center"},children:e.jsx(J,{className:"spinning",size:32})}):x.length===0?e.jsxs("div",{style:{padding:"60px",textAlign:"center",background:"var(--bg-card)",borderRadius:"20px",border:"1px solid var(--border-color)"},children:[e.jsx(me,{size:48,color:"#10b981",style:{marginBottom:"16px"}}),e.jsx("h3",{style:{color:"var(--text-primary)",margin:"0 0 8px"},children:"Zero Open Incidents"}),e.jsx("p",{style:{color:"var(--text-muted)"},children:"No threats detected across your infrastructure."})]}):e.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"16px"},children:x.map(s=>{var h,k,N;return e.jsxs("div",{style:{background:"var(--bg-card)",border:`1px solid ${s.severity==="critical"||s.severity==="high"?"rgba(239, 68, 68, 0.4)":"var(--border-color)"}`,borderRadius:"20px",padding:"24px",position:"relative",overflow:"hidden"},children:[s.status==="open"&&e.jsx("div",{style:{position:"absolute",top:0,left:0,right:0,height:"4px",background:s.severity==="critical"?"#ef4444":s.severity==="high"?"#f97316":"#eab308"}}),e.jsx("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"20px"},children:e.jsxs("div",{children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px",marginBottom:"8px"},children:[e.jsx("span",{style:{padding:"4px 10px",borderRadius:"8px",fontSize:"11px",fontWeight:800,textTransform:"uppercase",background:s.severity==="critical"?"rgba(239,68,68,0.2)":"rgba(249,115,22,0.2)",color:s.severity==="critical"?"#ef4444":"#f97316"},children:s.severity}),e.jsx("span",{style:{padding:"4px 10px",borderRadius:"8px",fontSize:"11px",fontWeight:800,textTransform:"uppercase",background:s.status==="open"?"rgba(239,68,68,0.1)":"rgba(16,185,129,0.1)",color:s.status==="open"?"#ef4444":"#10b981"},children:s.status}),e.jsx("span",{style:{color:"var(--text-muted)",fontSize:"12px"},children:new Date(s.createdAt).toLocaleString()})]}),e.jsx("h3",{style:{margin:"0 0 4px",fontSize:"20px",color:"var(--text-primary)"},children:s.title}),e.jsxs("p",{style:{margin:0,fontSize:"14px",color:"var(--text-secondary)"},children:["Detected on ",e.jsx("strong",{children:(h=s.serverId)==null?void 0:h.name})," (",(k=s.serverId)==null?void 0:k.host,")"]})]})}),e.jsxs("div",{style:{background:"#050505",borderRadius:"12px",padding:"16px",marginBottom:"20px",border:"1px solid rgba(255,255,255,0.05)"},children:[e.jsx("div",{style:{fontSize:"12px",color:"var(--text-muted)",marginBottom:"8px",textTransform:"uppercase",fontWeight:700},children:"Evidence Forensics"}),e.jsx("pre",{style:{margin:0,fontFamily:"monospace",fontSize:"12px",color:"#cbd5e1",whiteSpace:"pre-wrap"},children:JSON.stringify(s.evidence,null,2)})]}),s.status==="open"&&((N=s.recommendedActions)==null?void 0:N.length)>0&&e.jsxs("div",{style:{borderTop:"1px solid var(--border-color)",paddingTop:"20px"},children:[e.jsx("div",{style:{fontSize:"12px",color:"var(--text-muted)",marginBottom:"12px",textTransform:"uppercase",fontWeight:700},children:"Recommended One-Click Mitigations"}),e.jsx("div",{style:{display:"flex",gap:"12px",flexWrap:"wrap"},children:s.recommendedActions.map(g=>{var B,z,E,C,A;let w="Select Target...",m="";if(g==="kill_process_tree"&&s.evidence.suspicious_processes)w=`Kill PID ${(B=s.evidence.suspicious_processes[0])==null?void 0:B.pid}`,m=(z=s.evidence.suspicious_processes[0])==null?void 0:z.pid;else if(g==="quarantine_file"&&s.evidence.fim_changes){const d=(E=s.evidence.fim_changes[0])==null?void 0:E.path;w=`Quarantine ${d==null?void 0:d.split("/").pop()}`,m=d}else if(g==="KILL_PROCESS"&&s.evidence.unauthorized_users){const d=(C=s.evidence.unauthorized_users[0])==null?void 0:C.user;w=`Kick User: ${d}`,m=`-u ${d}`}else if(g==="KILL_PROCESS"&&s.evidence.suspicious_processes){const d=(A=s.evidence.suspicious_processes[0])==null?void 0:A.pid;w=`Kill PID ${d}`,m=d}const L=g==="kill_process_tree"?"KILL_PROCESS":g==="quarantine_file"?"QUARANTINE_FILE":g;return e.jsxs("button",{disabled:y[s._id]||!m,onClick:()=>r(s._id,s.serverId,L,m),style:{padding:"10px 16px",background:"rgba(239, 68, 68, 0.1)",border:"1px solid rgba(239, 68, 68, 0.2)",color:"#ef4444",borderRadius:"10px",fontSize:"13px",fontWeight:700,cursor:y[s._id]||!m?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:"8px",transition:"all 0.2s"},onMouseOver:d=>{d.currentTarget.disabled||(d.currentTarget.style.background="rgba(239, 68, 68, 0.2)")},onMouseOut:d=>{d.currentTarget.disabled||(d.currentTarget.style.background="rgba(239, 68, 68, 0.1)")},children:[e.jsx(K,{size:14}),g.toUpperCase(),": ",w]},g)})})]})]},s._id)})})}function Re(){const[x,c]=l.useState([]),[i,S]=l.useState(null),[y,j]=l.useState(!0),b=localStorage.getItem("token"),o=async()=>{try{const r=await fetch(`${u}/admin/sentinel/audit`,{headers:{Authorization:`Bearer ${b}`}});if(r.ok){const s=await r.json();c(s.data||[]),S(s.integrity)}}catch(r){console.error(r)}finally{j(!1)}};return l.useEffect(()=>{o()},[]),y?e.jsx("div",{style:{padding:"40px",textAlign:"center"},children:e.jsx(J,{className:"spinning",size:32})}):e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"24px"},children:[e.jsxs("div",{style:{background:i!=null&&i.valid?"rgba(16, 185, 129, 0.05)":"rgba(239, 68, 68, 0.05)",border:`1px solid ${i!=null&&i.valid?"rgba(16, 185, 129, 0.2)":"rgba(239, 68, 68, 0.2)"}`,padding:"16px 24px",borderRadius:"16px",display:"flex",alignItems:"center",justifyContent:"space-between"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"16px"},children:[i!=null&&i.valid?e.jsx(re,{size:32,color:"#10b981"}):e.jsx(se,{size:32,color:"#ef4444"}),e.jsxs("div",{children:[e.jsx("h3",{style:{margin:"0 0 4px",color:i!=null&&i.valid?"#10b981":"#ef4444",fontSize:"16px"},children:i!=null&&i.valid?"Cryptographic Chain Valid":"Tampering Detected in Chain"}),e.jsx("p",{style:{margin:0,fontSize:"13px",color:"var(--text-muted)"},children:i!=null&&i.valid?"All system and user mitigation actions have been mathematically verified for absolute immutability.":`Hash verification failed at index ${i==null?void 0:i.brokenAtIndex}. Audit log may be compromised.`})]})]}),e.jsx("div",{style:{fontSize:"12px",color:"var(--text-muted)",fontFamily:"monospace"},children:"SHA-256 Chained Hash Algorithm"})]}),e.jsx("div",{style:{background:"var(--bg-card)",border:"1px solid var(--border-color)",borderRadius:"20px",overflow:"hidden"},children:e.jsxs("table",{style:{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:"13px"},children:[e.jsx("thead",{style:{background:"rgba(255,255,255,0.02)",borderBottom:"1px solid var(--border-color)",color:"var(--text-secondary)"},children:e.jsxs("tr",{children:[e.jsx("th",{style:{padding:"16px 24px",fontWeight:600},children:"Timestamp"}),e.jsx("th",{style:{padding:"16px 24px",fontWeight:600},children:"Actor"}),e.jsx("th",{style:{padding:"16px 24px",fontWeight:600},children:"Action"}),e.jsx("th",{style:{padding:"16px 24px",fontWeight:600},children:"Target Resource"}),e.jsx("th",{style:{padding:"16px 24px",fontWeight:600},children:"Result"})]})}),e.jsx("tbody",{children:x.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:5,style:{padding:"40px",textAlign:"center",color:"var(--text-muted)"},children:"No audit events generated yet."})}):x.map(r=>e.jsxs("tr",{style:{borderBottom:"1px solid rgba(255,255,255,0.05)"},children:[e.jsx("td",{style:{padding:"16px 24px",color:"var(--text-secondary)"},children:new Date(r.timestamp).toLocaleString()}),e.jsx("td",{style:{padding:"16px 24px",color:r.actor==="system"?"var(--accent-primary)":"#60a5fa",fontWeight:600},children:r.actor.toUpperCase()}),e.jsx("td",{style:{padding:"16px 24px",color:"var(--text-primary)",fontWeight:600},children:r.action}),e.jsx("td",{style:{padding:"16px 24px",fontFamily:"monospace",color:"var(--text-secondary)"},children:r.resource}),e.jsx("td",{style:{padding:"16px 24px"},children:e.jsx("span",{style:{padding:"4px 8px",borderRadius:"6px",fontSize:"11px",fontWeight:700,background:r.result==="success"?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",color:r.result==="success"?"#10b981":"#ef4444"},children:r.result.toUpperCase()})})]},r._id))})]})})]})}function Te(){var r,s,h,k,N,g,w,m,L,B,z,E,C,A,d,T;const[x,c]=l.useState(null),[i,S]=l.useState(!0),y=async()=>{try{const p=localStorage.getItem("token"),f=await(await fetch("/api/admin/sentinel/telemetry/live",{headers:{Authorization:`Bearer ${p}`}})).json();f.success&&c(f.data)}catch(p){console.error(p)}finally{S(!1)}};l.useEffect(()=>{y();const p=setInterval(y,5e3);return()=>clearInterval(p)},[]);const j=async(p,$,f)=>{try{const U=localStorage.getItem("token");await fetch("/api/admin/sentinel/actions/execute",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${U}`},body:JSON.stringify({serverId:p,actionType:$,target:f})}),alert("Action enqueued for Agent Execution.")}catch{alert("Failed to execute")}};if(i)return e.jsx("div",{style:{color:"var(--text-muted)"},children:"Connecting to Host Telemetry..."});const b=x?Object.values(x):[];if(b.length===0)return e.jsx("div",{style:{color:"var(--text-muted)"},children:"No live telemetry available. Is the agent running?"});const o=b[0];return e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"24px"},children:[e.jsxs("div",{style:{display:"flex",gap:"16px"},children:[e.jsxs("div",{style:{flex:1,background:"var(--bg-card)",padding:"20px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsx(O,{size:24,style:{opacity:.5,marginBottom:"8px"}}),e.jsx("h4",{style:{margin:0,color:"var(--text-secondary)"},children:"Host Identity"}),e.jsx("h2",{style:{margin:"8px 0 0"},children:((r=o.metrics)==null?void 0:r.hostname)||"Unknown"}),e.jsxs("p",{style:{margin:0,color:"var(--text-muted)"},children:[(h=(s=o.metrics)==null?void 0:s.os)==null?void 0:h.platform," ",(N=(k=o.metrics)==null?void 0:k.os)==null?void 0:N.release]})]}),e.jsxs("div",{style:{flex:1,background:"var(--bg-card)",padding:"20px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsx(he,{size:24,style:{opacity:.5,marginBottom:"8px"}}),e.jsx("h4",{style:{margin:0,color:"var(--text-secondary)"},children:"Load Average (1m)"}),e.jsx("h2",{style:{margin:"8px 0 0"},children:(m=(w=(g=o.metrics)==null?void 0:g.cpu)==null?void 0:w.load1m)==null?void 0:m.toFixed(2)}),e.jsxs("p",{style:{margin:0,color:"var(--text-muted)"},children:["Cores: ",(B=(L=o.metrics)==null?void 0:L.cpu)==null?void 0:B.cores]})]}),e.jsxs("div",{style:{flex:1,background:"var(--bg-card)",padding:"20px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsx(be,{size:24,style:{opacity:.5,marginBottom:"8px"}}),e.jsx("h4",{style:{margin:0,color:"var(--text-secondary)"},children:"Memory Usage"}),e.jsxs("h2",{style:{margin:"8px 0 0"},children:[(E=(z=o.metrics)==null?void 0:z.memory)==null?void 0:E.usedPercent,"%"]}),e.jsxs("p",{style:{margin:0,color:"var(--text-muted)"},children:[(A=(C=o.metrics)==null?void 0:C.memory)==null?void 0:A.freeMB," MB Free"]})]})]}),e.jsxs("div",{style:{background:"var(--bg-card)",padding:"24px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px"},children:[e.jsx(Y,{size:20,color:"#ef4444"}),e.jsx("h3",{style:{margin:0},children:"Active SSH Sessions"})]}),o.users&&o.users.length>0?e.jsxs("table",{style:{width:"100%",borderCollapse:"collapse",textAlign:"left"},children:[e.jsx("thead",{children:e.jsxs("tr",{style:{color:"var(--text-muted)",borderBottom:"1px solid var(--border-color)"},children:[e.jsx("th",{style:{padding:"8px 0"},children:"User"}),e.jsx("th",{children:"Terminal"}),e.jsx("th",{children:"Login Time"}),e.jsx("th",{children:"Source IP"}),e.jsx("th",{children:"Action"})]})}),e.jsx("tbody",{children:o.users.map((p,$)=>{const f=p.user==="joe"||p.user==="root";return e.jsxs("tr",{style:{borderBottom:"1px solid var(--border-color)"},children:[e.jsxs("td",{style:{padding:"12px 0",fontWeight:"bold",color:f?"var(--text-primary)":"#ef4444"},children:[p.user," ",f?"":"(UNAUTHORIZED)"]}),e.jsx("td",{children:p.terminal}),e.jsx("td",{children:p.time}),e.jsx("td",{children:p.ip}),e.jsx("td",{children:e.jsx("button",{onClick:()=>j(o.serverId,"KILL_PROCESS",`-u ${p.user}`),style:{background:"rgba(239, 68, 68, 0.1)",color:"#ef4444",border:"none",padding:"6px 12px",borderRadius:"6px",cursor:"pointer"},children:"Kick User"})})]},$)})})]}):e.jsx("div",{style:{color:"var(--text-muted)"},children:"No active SSH sessions detected."})]}),e.jsxs("div",{style:{background:"var(--bg-card)",padding:"24px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px"},children:[e.jsx(W,{size:20,color:"#10b981"}),e.jsx("h3",{style:{margin:0},children:"Top Process Consumers (RAM)"})]}),e.jsxs("table",{style:{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:"13px"},children:[e.jsx("thead",{children:e.jsxs("tr",{style:{color:"var(--text-muted)",borderBottom:"1px solid var(--border-color)"},children:[e.jsx("th",{style:{padding:"8px 0"},children:"PID"}),e.jsx("th",{children:"User"}),e.jsx("th",{children:"CPU %"}),e.jsx("th",{children:"MEM %"}),e.jsx("th",{children:"Command"}),e.jsx("th",{children:"Action"})]})}),e.jsx("tbody",{children:(T=(d=o.processes)==null?void 0:d.topMem)==null?void 0:T.map((p,$)=>e.jsxs("tr",{style:{borderBottom:"1px solid var(--border-color)"},children:[e.jsx("td",{style:{padding:"12px 0"},children:p.pid}),e.jsx("td",{style:{color:p.user==="root"?"#ef4444":"inherit"},children:p.user}),e.jsx("td",{children:p.cpu}),e.jsx("td",{style:{fontWeight:"bold"},children:p.mem}),e.jsx("td",{style:{fontFamily:"monospace",maxWidth:"300px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:p.cmd}),e.jsx("td",{children:e.jsx("button",{onClick:()=>j(o.serverId,"KILL_PROCESS",p.pid),style:{background:"transparent",color:"var(--text-primary)",border:"1px solid var(--border-color)",padding:"4px 8px",borderRadius:"4px",cursor:"pointer"},children:"Kill"})})]},$))})]})]})]})}function $e(){const[x,c]=l.useState("overview"),[i,S]=l.useState({critical:0,high:0,medium:0,open:0,servers:1,blocked:Math.floor(Math.random()*5)});return l.useEffect(()=>{(async()=>{try{const b=await(await fetch(`${u}/admin/sentinel/incidents`,{headers:{Authorization:`Bearer ${localStorage.getItem("token")}`}})).json();if(b.success&&b.data){const o=b.data;S({critical:o.filter(r=>r.severity==="critical"&&r.status==="open").length,high:o.filter(r=>r.severity==="high"&&r.status==="open").length,medium:o.filter(r=>r.severity==="medium"&&r.status==="open").length,open:o.filter(r=>r.status==="open").length,servers:new Set(o.map(r=>{var s;return(s=r.serverId)==null?void 0:s._id})).size||1,blocked:3})}}catch{}})()},[]),e.jsxs(v.div,{initial:{opacity:0,y:10},animate:{opacity:1,y:0},className:"tab-pane",children:[e.jsx("style",{children:`
                .sentinel-layout {
                    display: flex;
                    gap: 32px;
                    align-items: flex-start;
                }
                .sentinel-sidebar {
                    width: 240px;
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    flex-shrink: 0;
                }
                .sentinel-nav-btn {
                    padding: 12px 16px;
                    border-radius: 12px;
                    background: transparent;
                    color: var(--text-secondary);
                    border: none;
                    text-align: left;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    transition: all 0.2s;
                }
                .sentinel-nav-btn.active {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }
                .sentinel-nav-btn:hover:not(.active) {
                    background: rgba(255, 255, 255, 0.05);
                    color: var(--text-primary);
                }
                .sentinel-content {
                    flex: 1;
                    min-width: 0;
                }
                .empty-block {
                    padding: 60px;
                    text-align: center;
                    background: var(--bg-card);
                    border: 1px dashed var(--border-color);
                    border-radius: 20px;
                    color: var(--text-muted);
                }
            `}),e.jsxs("div",{style:{marginBottom:"24px",display:"flex",alignItems:"center",gap:"16px"},children:[e.jsx("div",{style:{padding:"12px",background:"rgba(239, 68, 68, 0.1)",borderRadius:"14px",color:"#ef4444"},children:e.jsx(Y,{size:28})}),e.jsxs("div",{children:[e.jsx("h2",{style:{margin:0,fontSize:"24px",color:"var(--text-primary)"},children:"Joe Sentinel"}),e.jsx("p",{style:{margin:"4px 0 0",color:"var(--text-muted)",fontSize:"14px"},children:"Autonomous Server Security & Intrusion Detection"})]})]}),e.jsxs("div",{className:"sentinel-layout",children:[e.jsxs("div",{className:"sentinel-sidebar",children:[e.jsxs("button",{className:`sentinel-nav-btn ${x==="overview"?"active":""}`,onClick:()=>c("overview"),children:[e.jsx(W,{size:18})," Overview"]}),e.jsxs("button",{className:`sentinel-nav-btn ${x==="health"?"active":""}`,onClick:()=>c("health"),children:[e.jsx(O,{size:18})," Server Health"]}),e.jsxs("button",{className:`sentinel-nav-btn ${x==="incidents"?"active":""}`,onClick:()=>c("incidents"),children:[e.jsx(se,{size:18})," Live Incidents"]}),e.jsxs("button",{className:`sentinel-nav-btn ${x==="policies"?"active":""}`,onClick:()=>c("policies"),children:[e.jsx(ue,{size:18})," Policies & Rules"]}),e.jsxs("button",{className:`sentinel-nav-btn ${x==="audit"?"active":""}`,onClick:()=>c("audit"),children:[e.jsx(ye,{size:18})," Audit Trail"]}),e.jsxs("button",{className:`sentinel-nav-btn ${x==="forensics"?"active":""}`,onClick:()=>c("forensics"),children:[e.jsx(K,{size:18})," Forensics"]})]}),e.jsx("div",{className:"sentinel-content",children:e.jsxs(ae,{mode:"wait",children:[x==="overview"&&e.jsxs(v.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},children:[e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:"16px",marginBottom:"24px"},children:[e.jsxs("div",{style:{background:"var(--bg-card)",padding:"20px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsx("h4",{style:{margin:0,color:"var(--text-secondary)"},children:"Open Incidents"}),e.jsx("h1",{style:{margin:"8px 0 0",color:i.open>0?"#f97316":"#10b981"},children:i.open})]}),e.jsxs("div",{style:{background:"var(--bg-card)",padding:"20px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsx("h4",{style:{margin:0,color:"var(--text-secondary)"},children:"Critical Threats"}),e.jsx("h1",{style:{margin:"8px 0 0",color:i.critical>0?"#ef4444":"var(--text-primary)"},children:i.critical})]}),e.jsxs("div",{style:{background:"var(--bg-card)",padding:"20px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsx("h4",{style:{margin:0,color:"var(--text-secondary)"},children:"Risky Servers"}),e.jsx("h1",{style:{margin:"8px 0 0",color:i.open>0?"#f97316":"var(--text-primary)"},children:i.servers})]}),e.jsxs("div",{style:{background:"var(--bg-card)",padding:"20px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsx("h4",{style:{margin:0,color:"var(--text-secondary)"},children:"Blocked IPs"}),e.jsx("h1",{style:{margin:"8px 0 0",color:"#3b82f6"},children:i.blocked})]})]}),i.open===0&&e.jsxs("div",{className:"empty-block",children:[e.jsx(re,{size:48,style:{opacity:.2,margin:"0 auto 16px"}}),e.jsx("h3",{children:"System is Secure"}),e.jsx("p",{children:"Global Fleet Status is Nominal."})]})]},"overview"),x==="health"&&e.jsx(v.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},children:e.jsx(Te,{})},"health"),x==="incidents"&&e.jsx(v.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},children:e.jsx(Ie,{})},"incidents"),x==="policies"&&e.jsx(v.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},children:e.jsxs("div",{className:"empty-block",children:[e.jsx(K,{size:48,style:{opacity:.2,margin:"0 auto 16px"}}),e.jsx("h3",{children:"Static Policies"}),e.jsx("p",{children:"Joe Sentinel uses built-in heuristic rules for Phase 1. Dynamic policy editor coming in Phase 6."})]})},"policies"),x==="audit"&&e.jsx(v.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},children:e.jsx(Re,{})},"audit"),x==="forensics"&&e.jsx(v.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},children:e.jsxs("div",{style:{background:"var(--bg-card)",padding:"24px",borderRadius:"16px",border:"1px solid var(--border-color)"},children:[e.jsx("h3",{children:"File Integrity Hash Checker"}),e.jsx("p",{style:{color:"var(--text-muted)"},children:"Validate system binaries against known good states."}),e.jsxs("div",{style:{display:"flex",gap:"8px",marginTop:"16px"},children:[e.jsx("input",{type:"text",placeholder:"Enter absolute file path (e.g., /usr/local/bin/backdoor)",style:{flex:1,padding:"12px",borderRadius:"8px",background:"rgba(255,255,255,0.05)",color:"white",border:"1px solid var(--border-color)"}}),e.jsx("button",{style:{padding:"12px 24px",borderRadius:"8px",background:"var(--primary-color)",color:"white",border:"none",fontWeight:600},children:"Analyze Hash"})]})]})},"forensics")]})})]})]})}function Pe(){var Q;const x=Ae(),[c,i]=l.useState("dashboard"),[S,y]=l.useState(!0),[j,b]=l.useState(""),o=localStorage.getItem("token"),[r,s]=l.useState(null),[h,k]=l.useState([]),[N,g]=l.useState(!1),[w,m]=l.useState(new Date),[L,B]=l.useState(null),[z,E]=l.useState([]),[C,A]=l.useState(!1),[d,T]=l.useState(null),[p,$]=l.useState([]),[f,U]=l.useState(""),[q,G]=l.useState(null),[a,V]=l.useState(null),F=l.useCallback(async()=>{try{const t=await fetch(`${u}/admin/system/health`,{headers:{Authorization:`Bearer ${o}`}});if(t.ok){const n=await t.json();s(n)}}catch(t){console.error(t)}},[o]),ie=l.useCallback(async()=>{try{const t=await fetch(`${u}/admin/system/backups`,{headers:{Authorization:`Bearer ${o}`}});if(t.ok){const n=await t.json();k(n.backups||[])}}catch(t){console.error(t)}},[o]),P=l.useCallback(async()=>{try{const t=await fetch(`${u}/admin/deployments`,{headers:{Authorization:`Bearer ${o}`}});if(t.ok){const n=await t.json();E(n),T(R=>{if(!R)return null;const D=n.find(ge=>ge._id===R._id);return D?{...R,...D}:R})}}catch(t){console.error(t)}},[o]),M=l.useCallback(async()=>{try{const t=await fetch(`${u}/admin/users?search=${f}`,{headers:{Authorization:`Bearer ${o}`}});if(t.ok){const n=await t.json();$(n)}}catch(t){console.error(t)}},[o,f]),oe=async()=>{y(!0),c==="dashboard"?await Promise.all([F(),ie()]):c==="deployments"?await Promise.all([P(),Z()]):c==="admins"&&await M(),m(new Date),y(!1)},Z=async()=>{try{const t=await fetch(`${u}/admin/autodeploy/status`,{headers:{Authorization:`Bearer ${o}`}});t.ok&&V(await t.json())}catch(t){console.error(t)}};l.useEffect(()=>{oe()},[c,F,P,M]),l.useEffect(()=>{const n=setInterval(()=>{c==="dashboard"&&F(),(c==="deployments"||d)&&(P(),Z())},d?3e3:15e3);return()=>clearInterval(n)},[c,F,P,d]);const ne=async()=>{A(!0);try{const t=await fetch(`${u}/admin/deploy`,{method:"POST",headers:{Authorization:`Bearer ${o}`}});if(t.ok){const n=await t.json();await P(),n&&n.id&&T({_id:n.id,commit:"HEAD",status:"BUILDING",triggeredBy:"manual",startTime:new Date().toISOString(),logs:["=== Deployment Initiated ==="]})}}catch(t){console.error(t)}A(!0),setTimeout(()=>A(!1),2e3)},le=async()=>{if(window.confirm("Are you sure you want to clear all deployment history? This cannot be undone."))try{(await fetch(`${u}/admin/deployments`,{method:"DELETE",headers:{Authorization:`Bearer ${o}`}})).ok&&await P()}catch(t){console.error(t)}},de=async t=>{const n=t.role==="SUPER_ADMIN"?"USER":"SUPER_ADMIN";G(t._id);try{(await fetch(`${u}/admin/users/${t._id}/role`,{method:"PATCH",headers:{Authorization:`Bearer ${o}`,"Content-Type":"application/json"},body:JSON.stringify({role:n})})).ok&&await M()}catch(R){console.error(R)}G(null)},I=t=>{const n=t==null?void 0:t.match(/([\d.]+)%/);return n?parseFloat(n[1]):0},_=t=>t<60?"#00e676":t<85?"#ffc107":"#ff5252",ce=()=>{var t;return e.jsxs(v.div,{initial:{opacity:0},animate:{opacity:1},className:"tab-pane",children:[e.jsx("div",{className:"grid-stats",children:r&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"stat-card cpu",children:[e.jsxs("div",{className:"stat-icon",children:[e.jsx(W,{size:18,color:"#60a5fa"}),e.jsx("span",{className:"stat-label",children:"CPU Usage"})]}),e.jsx("div",{className:"stat-value",style:{color:_(I(r.system.cpu))},children:r.system.cpu}),e.jsxs("div",{className:"stat-sub",children:[r.system.platform," • Node ",r.system.nodeVersion]}),e.jsx("div",{className:"progress-bar",children:e.jsx("div",{className:"progress-fill",style:{width:`${I(r.system.cpu)}%`,background:_(I(r.system.cpu))}})})]}),e.jsxs("div",{className:"stat-card memory",children:[e.jsxs("div",{className:"stat-icon",children:[e.jsx(te,{size:18,color:"#a78bfa"}),e.jsx("span",{className:"stat-label",children:"Memory"})]}),e.jsx("div",{className:"stat-value",style:{color:_(I(r.system.memory))},children:r.system.memory}),e.jsx("div",{className:"stat-sub",children:"Active processes memory"}),e.jsx("div",{className:"progress-bar",children:e.jsx("div",{className:"progress-fill",style:{width:`${I(r.system.memory)}%`,background:_(I(r.system.memory))}})})]}),e.jsxs("div",{className:"stat-card disk",children:[e.jsxs("div",{className:"stat-icon",children:[e.jsx(ke,{size:18,color:"#f59e0b"}),e.jsx("span",{className:"stat-label",children:"Disk Usage"})]}),e.jsx("div",{className:"stat-value",style:{color:_(I(r.system.disk))},children:r.system.disk}),e.jsx("div",{className:"stat-sub",children:"Root filesystem"}),e.jsx("div",{className:"progress-bar",children:e.jsx("div",{className:"progress-fill",style:{width:`${I(r.system.disk)}%`,background:_(I(r.system.disk))}})})]}),e.jsxs("div",{className:"stat-card db",children:[e.jsxs("div",{className:"stat-icon",children:[e.jsx(O,{size:18,color:"#10b981"}),e.jsx("span",{className:"stat-label",children:"Database"})]}),e.jsx("div",{className:"stat-value",style:{color:"#10b981"},children:r.database.dataSize||"N/A"}),e.jsxs("div",{className:"stat-sub",children:[r.database.documents||0," docs • ",r.database.collections||0," collections"]})]})]})}),e.jsxs("div",{className:"section-card",children:[e.jsx("div",{className:"section-header",onClick:()=>B(L==="containers"?null:"containers"),children:e.jsxs("div",{className:"section-header-left",children:[e.jsx(O,{size:18,color:"#60a5fa"}),e.jsx("span",{className:"section-title",children:"Container Fleet"}),e.jsxs("span",{className:"section-badge",children:[((t=r==null?void 0:r.containers)==null?void 0:t.length)||0," running"]})]})}),(r==null?void 0:r.containers)&&e.jsx("div",{className:"section-body",children:e.jsx("div",{className:"container-grid",children:r.containers.map((n,R)=>{var D;return e.jsxs("div",{className:"container-item",children:[e.jsx("div",{className:`container-dot ${(D=n.Status)!=null&&D.includes("Up")?"healthy":"unhealthy"}`}),e.jsxs("div",{children:[e.jsx("div",{className:"container-name",children:n.Names}),e.jsx("div",{className:"container-status",children:n.Status})]})]},R)})})})]})]})},pe=()=>e.jsxs(v.div,{initial:{opacity:0,y:10},animate:{opacity:1,y:0},className:"tab-pane",children:[e.jsxs("div",{className:"deploy-actions",style:{display:"flex",gap:"12px"},children:[e.jsxs("button",{className:"btn-deploy-refined",onClick:ne,disabled:C,children:[C?e.jsx(J,{size:20,className:"spinning"}):e.jsx(H,{size:20}),C?"Processing Deployment...":"Deploy Production"]}),e.jsxs("button",{className:"btn-clear-refined",onClick:le,disabled:z.length===0,children:[e.jsx(we,{size:20}),"Clear History"]})]}),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-card)",border:"1px solid var(--border-color)",borderRadius:"16px",padding:"16px 24px",marginBottom:"24px",gap:"16px",flexWrap:"wrap"},children:[e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"10px",fontWeight:600,fontSize:"15px",color:(a==null?void 0:a.pollerEnabled)??!0?"#10b981":"#ef4444"},children:[e.jsx("div",{style:{width:"10px",height:"10px",borderRadius:"50%",background:(a==null?void 0:a.pollerEnabled)??!0?"#10b981":"#ef4444",boxShadow:(a==null?void 0:a.pollerEnabled)??!0?"0 0 8px #10b981":"0 0 8px #ef4444",animation:a!=null&&a.pollerActive?"pulse-glow 2s infinite":"none"}}),e.jsx("span",{children:(a==null?void 0:a.pollerEnabled)??!0?a!=null&&a.pollerActive?"🟢 Auto-Deploy Fetching...":"🟢 Auto-Deploy Standby":"🔴 Auto-Deploy Disabled"})]}),a&&e.jsxs("div",{style:{display:"flex",gap:"8px",flexWrap:"wrap"},children:[e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(255,255,255,0.05)",color:"var(--text-muted)",fontFamily:"monospace"},children:["Poll #",a.pollCount||0]}),a.lastPollTime&&e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(255,255,255,0.05)",color:"var(--text-muted)",fontFamily:"monospace"},children:["Last: ",new Date(a.lastPollTime).toLocaleTimeString()]}),a.lastLocalCommit&&e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(59,130,246,0.1)",color:"#3b82f6",fontFamily:"monospace"},children:["Local: ",a.lastLocalCommit]}),a.lastRemoteCommit&&e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(59,130,246,0.1)",color:"#3b82f6",fontFamily:"monospace"},children:["Remote: ",a.lastRemoteCommit]}),a.lastPollError&&e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(239,68,68,0.1)",color:"#ef4444",fontFamily:"monospace"},children:["⚠️ ",a.lastPollError.slice(0,60)]})]})]}),e.jsx("button",{onClick:async()=>{const t=!((a==null?void 0:a.pollerEnabled)??!0);try{const n=await fetch(`${u}/admin/autodeploy/toggle`,{method:"POST",headers:{Authorization:`Bearer ${o}`,"Content-Type":"application/json"},body:JSON.stringify({enabled:t})});n.ok&&V(await n.json())}catch(n){console.error(n)}},style:{padding:"8px 16px",borderRadius:"10px",border:"1px solid",borderColor:(a==null?void 0:a.pollerEnabled)??!0?"rgba(239,68,68,0.3)":"rgba(16,185,129,0.3)",background:(a==null?void 0:a.pollerEnabled)??!0?"rgba(239,68,68,0.1)":"rgba(16,185,129,0.1)",color:(a==null?void 0:a.pollerEnabled)??!0?"#ef4444":"#10b981",fontSize:"13px",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:"6px",transition:"all 0.2s",flexShrink:0},children:(a==null?void 0:a.pollerEnabled)??!0?"⏸ Disable":"▶ Enable"})]}),e.jsxs("div",{className:"section-card",children:[e.jsxs("div",{className:"section-header",children:[e.jsxs("div",{style:{display:"flex",alignItems:"center"},children:[e.jsx(te,{size:20,color:"var(--accent-primary)"}),e.jsx("span",{className:"section-title",children:"Deployment Pipeline"})]}),e.jsxs("span",{className:"section-badge",style:{background:"rgba(240,185,11,0.1)",color:"var(--accent-primary)"},children:[z.length," Total Logs"]})]}),e.jsx("div",{style:{padding:"16px"},children:z.length>0?z.map(t=>{var n;return e.jsxs("div",{className:"dep-item",children:[e.jsxs("div",{style:{display:"flex",alignItems:"center"},children:[e.jsx("span",{className:`dep-badge ${t.status.toLowerCase()}`,children:t.status}),e.jsxs("div",{style:{display:"flex",flexDirection:"column"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px"},children:[e.jsxs("span",{className:"dep-commit",children:["#",t.commit.slice(0,7)]}),e.jsx("span",{className:"dep-time",children:new Date(t.startTime).toLocaleString()})]}),e.jsxs("div",{className:"dep-meta",children:["Triggered by ",e.jsx("span",{style:{color:"var(--text-primary)"},children:t.triggeredBy})," • Duration: ",((n=t.duration)==null?void 0:n.toFixed(1))||"?","s"]})]})]}),e.jsxs("button",{className:"dep-log-btn",onClick:()=>T(t),children:[e.jsx(ee,{size:14})," View Logs"]})]},t._id)}):e.jsxs("div",{className:"empty-state",style:{padding:"60px",textAlign:"center",color:"var(--text-muted)"},children:[e.jsx(H,{size:48,style:{opacity:.1,marginBottom:"16px"}}),e.jsx("p",{children:"No deployment history available."})]})})]})]}),xe=()=>e.jsxs(v.div,{initial:{opacity:0,y:10},animate:{opacity:1,y:0},className:"tab-pane",children:[e.jsxs("div",{className:"admin-search-box",children:[e.jsx(ze,{size:20,className:"search-icon"}),e.jsx("input",{type:"text",placeholder:"Search administrators by name or email...",value:f,onChange:t=>U(t.target.value),onKeyUp:t=>t.key==="Enter"&&M()})]}),e.jsxs("div",{className:"user-list",children:[p.map(t=>{var n;return e.jsxs("div",{className:"user-item",children:[e.jsx("div",{className:"user-avatar",children:t.picture?e.jsx("img",{src:t.picture,alt:""}):e.jsx("div",{className:"fallback",children:((n=t.name)==null?void 0:n.charAt(0))||t.email.charAt(0).toUpperCase()})}),e.jsxs("div",{className:"user-info",children:[e.jsx("div",{className:"user-name",children:t.name||"Anonymous Operator"}),e.jsx("div",{className:"user-email",children:t.email})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"20px"},children:[e.jsx("div",{className:"user-role-badge",children:t.role}),e.jsx("button",{className:`role-toggle-btn ${t.role==="SUPER_ADMIN"?"is-admin":""}`,onClick:()=>de(t),disabled:q===t._id,children:q===t._id?e.jsx(Se,{size:14,className:"spinning"}):t.role==="SUPER_ADMIN"?e.jsxs(e.Fragment,{children:[e.jsx(Ne,{size:14})," Revoke Access"]}):e.jsxs(e.Fragment,{children:[e.jsx(Ce,{size:14})," Promote to Admin"]})})]})]},t._id)}),p.length===0&&!S&&e.jsxs("div",{className:"section-card",style:{padding:"80px",textAlign:"center",color:"var(--text-muted)"},children:[e.jsx(X,{size:48,style:{opacity:.1,marginBottom:"16px"}}),e.jsx("p",{children:"No matching personnel records found."})]})]})]});return e.jsxs("div",{className:"system-management",children:[e.jsx("style",{children:`
                .system-management {
                    min-height: 100vh;
                    background: var(--bg-dark);
                    color: var(--text-primary);
                    padding: 40px;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    overflow-x: hidden;
                }
                .system-management::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; height: 1px;
                    background: linear-gradient(to right, transparent, var(--accent-primary), transparent);
                    opacity: 0.3;
                }
                .mgmt-header {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    margin-bottom: 48px;
                }
                .mgmt-back-container {
                    display: flex;
                    align-items: center;
                    flex: 1;
                    justify-content: flex-end;
                }
                .mgmt-title-row {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    flex: 1;
                    justify-content: flex-start;
                }
                .joe-logo-badge {
                    width: 50px;
                    height: 50px;
                    background: var(--brand-gradient);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    font-weight: 900;
                    color: #000;
                    box-shadow: 0 10px 30px var(--accent-glow);
                }
                .mgmt-title h1 {
                    font-size: 32px;
                    font-weight: 800;
                    margin: 0;
                    letter-spacing: -0.02em;
                    background: var(--brand-text-gradient);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .mgmt-subtitle {
                    margin: 4px 0 0;
                    font-size: 14px;
                    color: var(--text-muted);
                    font-weight: 500;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }
                .mgmt-tabs {
                    display: flex;
                    gap: 8px;
                    background: rgba(255,255,255,0.02);
                    padding: 6px;
                    border-radius: 16px;
                    border: 1px solid var(--border-color);
                    justify-content: center;
                    flex: 0 1 auto;
                    backdrop-filter: blur(10px);
                }
                .tab-btn {
                    padding: 10px 24px;
                    border-radius: 12px;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .tab-btn.active {
                    background: var(--bg-card);
                    color: var(--accent-primary);
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                    border: 1px solid var(--border-light);
                }
                .tab-btn:hover:not(.active) {
                    background: rgba(255,255,255,0.05);
                    color: var(--text-primary);
                }

                .grid-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 24px;
                    margin-bottom: 32px;
                }
                .stat-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 24px;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                .stat-card:hover {
                    transform: translateY(-5px);
                    border-color: var(--border-light);
                    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
                }
                .stat-card::after {
                    content: '';
                    position: absolute;
                    top: 0; right: 0;
                    width: 100px; height: 100px;
                    background: radial-gradient(circle at top right, var(--accent-glow), transparent 70%);
                    opacity: 0.5;
                }
                .stat-icon { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
                .stat-label { font-size: 13px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
                .stat-value { font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
                .stat-sub { font-size: 13px; color: var(--text-muted); margin-top: 8px; }
                .progress-bar { height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; margin-top: 16px; overflow: hidden; }
                .progress-fill { height: 100%; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1); }

                .section-card { 
                    background: var(--bg-card); 
                    border: 1px solid var(--border-color); 
                    border-radius: 24px; 
                    margin-bottom: 32px;
                    overflow: hidden;
                }
                .section-header { 
                    padding: 24px 32px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: space-between;
                    background: rgba(255,255,255,0.01);
                    border-bottom: 1px solid var(--border-color);
                }
                .section-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-left: 12px; }
                .section-badge { 
                    padding: 4px 12px; 
                    background: rgba(16, 185, 129, 0.1); 
                    color: #10b981; 
                    border-radius: 20px; 
                    font-size: 12px; 
                    font-weight: 700; 
                }
                .section-body { padding: 32px; }
                .container-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
                .container-item { 
                    padding: 16px 20px; 
                    background: rgba(0,0,0,0.2); 
                    border: 1px solid var(--border-color);
                    border-radius: 16px; 
                    display: flex; 
                    align-items: center; 
                    gap: 16px;
                    transition: all 0.2s ease;
                }
                .container-item:hover {
                    border-color: var(--border-light);
                    background: rgba(255,255,255,0.02);
                }
                .container-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
                .container-dot.healthy { background: #00e676; box-shadow: 0 0 10px rgba(0, 230, 118, 0.4); }
                .container-dot.unhealthy { background: #ff5252; box-shadow: 0 0 10px rgba(255, 82, 82, 0.4); }
                .container-name { font-weight: 700; font-size: 15px; color: var(--text-primary); margin-bottom: 2px; }
                .container-status { font-size: 12px; color: var(--text-muted); font-weight: 500; }

                .deploy-actions {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 32px;
                }
                .btn-deploy-refined {
                    padding: 14px 28px;
                    background: var(--brand-gradient);
                    color: #000;
                    border: none;
                    border-radius: 14px;
                    font-size: 15px;
                    font-weight: 800;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: 0 10px 25px var(--accent-glow);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .btn-deploy-refined:hover { 
                    transform: translateY(-3px) scale(1.02); 
                    box-shadow: 0 15px 35px rgba(240, 185, 11, 0.3); 
                }
                .btn-deploy-refined:active { transform: scale(0.98); }
                .btn-deploy-refined:disabled { opacity: 0.5; transform: none; box-shadow: none; cursor: not-allowed; }

                .btn-clear-refined {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    padding: 12px 24px;
                    border-radius: 14px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 15px;
                }

                .btn-clear-refined:hover:not(:disabled) {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: #ef4444;
                    box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);
                    transform: translateY(-2px);
                }

                .btn-clear-refined:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                    filter: grayscale(1);
                }

                .dep-item {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 20px 24px;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    transition: all 0.2s ease;
                }
                .dep-item:hover { border-color: var(--border-light); }
                .dep-badge { 
                    padding: 6px 12px; 
                    border-radius: 8px; 
                    font-size: 11px; 
                    font-weight: 800; 
                    text-transform: uppercase; 
                    margin-right: 16px;
                    letter-spacing: 0.05em;
                }
                .dep-badge.success { background: rgba(0,230,118,0.15); color: #00e676; }
                .dep-badge.failed { background: rgba(255,82,82,0.15); color: #ff5252; }
                .dep-badge.building { background: rgba(240,185,11,0.15); color: var(--accent-primary); }
                
                .dep-commit { font-family: 'JetBrains Mono', monospace; color: var(--text-muted); margin-right: 16px; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 6px; font-size: 13px; }
                .dep-time { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
                .dep-log-btn { 
                    background: var(--bg-secondary); 
                    border: 1px solid var(--border-color); 
                    color: var(--text-primary); 
                    padding: 8px 16px; 
                    border-radius: 10px; 
                    cursor: pointer; 
                    display: flex; 
                    align-items: center; 
                    gap: 8px; 
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .dep-log-btn:hover { background: rgba(255,255,255,0.08); border-color: var(--accent-primary); }

                .admin-search-box {
                    position: relative;
                    margin-bottom: 32px;
                    max-width: 600px;
                }
                .admin-search-box input {
                    width: 100%;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 16px 16px 16px 52px;
                    color: var(--text-primary);
                    font-size: 16px;
                    outline: none;
                    transition: all 0.2s;
                }
                .admin-search-box input:focus { border-color: var(--accent-primary); box-shadow: 0 0 15px var(--accent-glow); }
                .admin-search-box .search-icon { position: absolute; left: 20px; top: 18px; color: var(--text-muted); }

                .user-item {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 20px;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    margin-bottom: 16px;
                    transition: all 0.2s;
                }
                .user-avatar { 
                    width: 56px; height: 56px; 
                    border-radius: 16px; 
                    background: var(--brand-gradient); 
                    display: flex; align-items: center; justify-content: center; overflow: hidden; 
                    padding: 2px;
                }
                .user-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 14px; }
                .user-avatar .fallback { color: #000; font-weight: 800; font-size: 20px; }
                .user-info { flex: 1; }
                .user-name { font-weight: 700; font-size: 17px; color: var(--text-primary); }
                .user-email { font-size: 14px; color: var(--text-secondary); margin-top: 2px; }
                .user-role-badge { 
                    padding: 6px 14px; 
                    background: rgba(240, 185, 11, 0.1); 
                    color: var(--accent-primary); 
                    border-radius: 24px; 
                    font-size: 12px; 
                    font-weight: 800; 
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .role-toggle-btn {
                    padding: 10px 20px;
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 14px;
                    font-weight: 700;
                    transition: all 0.2s;
                }
                .role-toggle-btn.is-admin { border-color: rgba(255,82,82,0.3); color: #ff5252; }
                .role-toggle-btn:hover { background: rgba(255,255,255,0.05); transform: translateY(-2px); }

                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 4px #10b981; }
                    50% { box-shadow: 0 0 16px #10b981; }
                }
                .spinning { animation: spin 1s linear infinite; }

                .btn-back {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 16px;
                    height: 44px;
                    border-radius: 12px;
                    border: 1px solid var(--accent-primary);
                    background: rgba(240, 193, 75, 0.1);
                    color: var(--accent-primary);
                    font-weight: 700;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    margin-right: 16px;
                }
                .btn-back:hover {
                    background: var(--accent-primary);
                    color: #000;
                    transform: translateX(-3px);
                }

                /* Laptop & Mobile Responsiveness */
                @media (max-width: 1440px) {
                    .system-management { padding: 24px; }
                    .mgmt-header { gap: 16px; margin-bottom: 24px; overflow-x: auto; }
                    .mgmt-title h1 { font-size: 24px; }
                    .mgmt-tabs { flex-wrap: nowrap; gap: 8px; flex-shrink: 0; }
                    .tab-btn { padding: 8px 16px; font-size: 13px; white-space: nowrap; }
                    .grid-stats { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
                    .stat-value { font-size: 28px; }
                    .section-card { margin-bottom: 24px; }
                }

                @media (max-width: 768px) {
                    .system-management { padding: 16px; min-height: auto; }
                    .mgmt-header { flex-direction: column; align-items: stretch; gap: 20px; }
                    .mgmt-back-container { justify-content: flex-start; margin-bottom: -10px; }
                    .mgmt-title-row { justify-content: flex-start; }
                    .mgmt-title h1 { font-size: 22px; }
                    .joe-logo-badge { width: 40px; height: 40px; font-size: 20px; }
                    .tab-btn { padding: 8px 12px; font-size: 12px; flex: 1; justify-content: center; }
                    .mgmt-tabs { width: 100%; display: flex; overflow-x: auto; flex-wrap: nowrap; }
                    .grid-stats { grid-template-columns: 1fr; }
                    .dep-item { flex-direction: column; align-items: flex-start; gap: 12px; }
                    .dep-log-btn { width: 100%; justify-content: center; }
                    .user-item { flex-direction: column; align-items: flex-start; }
                    .role-toggle-btn { width: 100%; justify-content: center; }
                }
            `}),e.jsxs("div",{className:"mgmt-header",children:[e.jsxs("div",{className:"mgmt-title-row",children:[e.jsx("div",{className:"joe-logo-badge",children:"J"}),e.jsxs("div",{className:"mgmt-title",children:[e.jsx("h1",{children:"⚙️ System Management"}),e.jsx("p",{className:"mgmt-subtitle",children:"Joe Autonomous Infrastructure Control"})]})]}),e.jsxs("div",{className:"mgmt-tabs",children:[e.jsxs("button",{className:`tab-btn ${c==="dashboard"?"active":""}`,onClick:()=>i("dashboard"),children:[e.jsx(W,{size:16})," Dashboard"]}),e.jsxs("button",{className:`tab-btn ${c==="deployments"?"active":""}`,onClick:()=>i("deployments"),children:[e.jsx(H,{size:16})," Deployments"]}),e.jsxs("button",{className:`tab-btn ${c==="admins"?"active":""}`,onClick:()=>i("admins"),children:[e.jsx(X,{size:16})," Admins"]}),e.jsxs("button",{className:`tab-btn ${c==="sentinel"?"active":""}`,onClick:()=>i("sentinel"),children:[e.jsx(Y,{size:16})," Sentinel ",e.jsx("span",{style:{padding:"2px 6px",background:"#ef4444",color:"white",fontSize:"10px",borderRadius:"4px",marginLeft:"6px"},children:"NEW"})]})]}),e.jsx("div",{className:"mgmt-back-container",children:e.jsxs("button",{className:"btn-back",onClick:()=>x("/joe"),title:"العودة إلى مساحة العمل",children:[e.jsx(fe,{size:18,style:{marginRight:6}})," رجوع للخلف"]})})]}),e.jsxs(ae,{mode:"wait",children:[c==="dashboard"&&ce(),c==="deployments"&&pe(),c==="admins"&&xe(),c==="sentinel"&&e.jsx($e,{})]}),d&&e.jsx("div",{id:"logs-modal-portal",style:{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",background:"rgba(0,0,0,0.95)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999999},onClick:()=>T(null),children:e.jsxs(v.div,{initial:{scale:.95,opacity:0,y:20},animate:{scale:1,opacity:1,y:0},onClick:t=>t.stopPropagation(),style:{background:"var(--bg-card)",width:"94%",maxWidth:"1000px",height:"85vh",borderRadius:"24px",display:"flex",flexDirection:"column",border:"1px solid var(--border-color)",overflow:"hidden",boxShadow:"0 50px 100px -20px rgba(0, 0, 0, 0.7)"},children:[e.jsxs("div",{style:{padding:"24px 32px",borderBottom:"1px solid var(--border-color)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.02)"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"14px"},children:[e.jsx("div",{style:{width:"36px",height:"36px",background:"rgba(240, 185, 11, 0.1)",borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx(ee,{size:20,color:"var(--accent-primary)"})}),e.jsxs("div",{children:[e.jsx("h3",{style:{margin:0,fontSize:"18px",color:"var(--text-primary)",fontWeight:700},children:"Deployment Logs"}),e.jsxs("span",{style:{color:"var(--text-muted)",fontSize:"13px",fontFamily:"monospace"},children:["Commit #",((Q=d.commit)==null?void 0:Q.slice(0,7))||"??"]})]})]}),e.jsxs("div",{style:{display:"flex",gap:"12px"},children:[e.jsxs("button",{onClick:()=>{const t=(d.logs||[]).join(`
`);navigator.clipboard.writeText(t),alert("Logs copied successfully!")},style:{background:"var(--bg-secondary)",color:"var(--text-primary)",border:"1px solid var(--border-color)",padding:"10px 20px",borderRadius:"12px",cursor:"pointer",display:"flex",alignItems:"center",gap:"10px",fontSize:"14px",fontWeight:600,transition:"all 0.2s"},onMouseOver:t=>{t.currentTarget.style.background="rgba(255,255,255,0.08)",t.currentTarget.style.borderColor="var(--accent-primary)"},onMouseOut:t=>{t.currentTarget.style.background="var(--bg-secondary)",t.currentTarget.style.borderColor="var(--border-color)"},children:[e.jsx(ve,{size:16})," Copy Logs"]}),e.jsx("button",{onClick:()=>T(null),style:{background:"transparent",border:"none",color:"var(--text-muted)",cursor:"pointer",transition:"color 0.2s"},onMouseOver:t=>t.currentTarget.style.color="#ef4444",onMouseOut:t=>t.currentTarget.style.color="var(--text-muted)",children:e.jsx(je,{size:28})})]})]}),e.jsx("div",{style:{flex:1,overflowY:"auto",padding:"32px",background:"#050505",color:"#cbd5e1",fontSize:"13px",lineHeight:"1.7",fontFamily:'"JetBrains Mono", "Fira Code", monospace'},children:d.logs&&d.logs.length>0?d.logs.map((t,n)=>e.jsxs("div",{style:{display:"flex",gap:"20px",marginBottom:"4px"},children:[e.jsx("span",{style:{color:"#2d3748",userSelect:"none",minWidth:"40px",textAlign:"right"},children:n+1}),e.jsx("span",{style:{color:t.toLowerCase().includes("error")?"#ff5252":t.toLowerCase().includes("success")?"#00e676":"#cbd5e1"},children:t})]},n)):e.jsx("div",{style:{textAlign:"center",padding:"80px",color:"#334155",fontStyle:"italic"},children:"No deployment trace recorded."})})]})})]})}export{Pe as default};

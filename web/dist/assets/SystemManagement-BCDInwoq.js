import{u as ae,r as s,A as d,j as e}from"./index-CnOr911B.js";import{A as I,R as w,S as T,T as E,b as re,a as se,C as P,H as oe,d as ie,c as ne}from"./terminal-CLp4uYhZ.js";import{A as le}from"./arrow-right-CUXLGNSi.js";import{A as ce,L as de}from"./index-Df6OqFLx.js";import{m as y}from"./proxy-C2D1ZQkn.js";import{c as N}from"./createLucideIcon-Cz9cw0DZ.js";import{T as pe}from"./trash-2-zFGFtLlC.js";const xe=[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]],L=N("server",xe);const me=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}],["line",{x1:"22",x2:"16",y1:"11",y2:"11",key:"1shjgl"}]],ge=N("user-minus",me);const be=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}],["line",{x1:"19",x2:"19",y1:"8",y2:"14",key:"1bvyxn"}],["line",{x1:"22",x2:"16",y1:"11",y2:"11",key:"1shjgl"}]],he=N("user-plus",be);function Re(){const U=ae(),[i,f]=s.useState("dashboard"),[B,z]=s.useState(!0),[ue,ye]=s.useState(""),n=localStorage.getItem("token"),[r,_]=s.useState(null),[fe,M]=s.useState([]),[ve,je]=s.useState(!1),[ke,F]=s.useState(new Date),[H,O]=s.useState(null),[b,W]=s.useState([]),[v,j]=s.useState(!1),[l,g]=s.useState(null),[S,J]=s.useState([]),[k,Y]=s.useState(""),[C,A]=s.useState(null),[o,D]=s.useState(null),h=s.useCallback(async()=>{try{const t=await fetch(`${d}/admin/system/health`,{headers:{Authorization:`Bearer ${n}`}});if(t.ok){const a=await t.json();_(a)}}catch(t){console.error(t)}},[n]),q=s.useCallback(async()=>{try{const t=await fetch(`${d}/admin/system/backups`,{headers:{Authorization:`Bearer ${n}`}});if(t.ok){const a=await t.json();M(a.backups||[])}}catch(t){console.error(t)}},[n]),x=s.useCallback(async()=>{try{const t=await fetch(`${d}/admin/deployments`,{headers:{Authorization:`Bearer ${n}`}});if(t.ok){const a=await t.json();W(a),g(p=>{if(!p)return null;const $=a.find(te=>te._id===p._id);return $?{...p,...$}:p})}}catch(t){console.error(t)}},[n]),u=s.useCallback(async()=>{try{const t=await fetch(`${d}/admin/users?search=${k}`,{headers:{Authorization:`Bearer ${n}`}});if(t.ok){const a=await t.json();J(a)}}catch(t){console.error(t)}},[n,k]),V=async()=>{z(!0),i==="dashboard"?await Promise.all([h(),q()]):i==="deployments"?await Promise.all([x(),R()]):i==="admins"&&await u(),F(new Date),z(!1)},R=async()=>{try{const t=await fetch(`${d}/admin/autodeploy/status`,{headers:{Authorization:`Bearer ${n}`}});t.ok&&D(await t.json())}catch(t){console.error(t)}};s.useEffect(()=>{V()},[i,h,x,u]),s.useEffect(()=>{const a=setInterval(()=>{i==="dashboard"&&h(),(i==="deployments"||l)&&(x(),R())},l?3e3:15e3);return()=>clearInterval(a)},[i,h,x,l]);const X=async()=>{j(!0);try{const t=await fetch(`${d}/admin/deploy`,{method:"POST",headers:{Authorization:`Bearer ${n}`}});if(t.ok){const a=await t.json();await x(),a&&a.id&&g({_id:a.id,commit:"HEAD",status:"BUILDING",triggeredBy:"manual",startTime:new Date().toISOString(),logs:["=== Deployment Initiated ==="]})}}catch(t){console.error(t)}j(!0),setTimeout(()=>j(!1),2e3)},G=async()=>{if(window.confirm("Are you sure you want to clear all deployment history? This cannot be undone."))try{(await fetch(`${d}/admin/deployments`,{method:"DELETE",headers:{Authorization:`Bearer ${n}`}})).ok&&await x()}catch(t){console.error(t)}},K=async t=>{const a=t.role==="SUPER_ADMIN"?"USER":"SUPER_ADMIN";A(t._id);try{(await fetch(`${d}/admin/users/${t._id}/role`,{method:"PATCH",headers:{Authorization:`Bearer ${n}`,"Content-Type":"application/json"},body:JSON.stringify({role:a})})).ok&&await u()}catch(p){console.error(p)}A(null)},c=t=>{const a=t?.match(/([\d.]+)%/);return a?parseFloat(a[1]):0},m=t=>t<60?"#00e676":t<85?"#ffc107":"#ff5252",Q=()=>e.jsxs(y.div,{initial:{opacity:0},animate:{opacity:1},className:"tab-pane",children:[e.jsx("div",{className:"grid-stats",children:r&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"stat-card cpu",children:[e.jsxs("div",{className:"stat-icon",children:[e.jsx(I,{size:18,color:"#60a5fa"}),e.jsx("span",{className:"stat-label",children:"CPU Usage"})]}),e.jsx("div",{className:"stat-value",style:{color:m(c(r.system.cpu))},children:r.system.cpu}),e.jsxs("div",{className:"stat-sub",children:[r.system.platform," • Node ",r.system.nodeVersion]}),e.jsx("div",{className:"progress-bar",children:e.jsx("div",{className:"progress-fill",style:{width:`${c(r.system.cpu)}%`,background:m(c(r.system.cpu))}})})]}),e.jsxs("div",{className:"stat-card memory",children:[e.jsxs("div",{className:"stat-icon",children:[e.jsx(P,{size:18,color:"#a78bfa"}),e.jsx("span",{className:"stat-label",children:"Memory"})]}),e.jsx("div",{className:"stat-value",style:{color:m(c(r.system.memory))},children:r.system.memory}),e.jsx("div",{className:"stat-sub",children:"Active processes memory"}),e.jsx("div",{className:"progress-bar",children:e.jsx("div",{className:"progress-fill",style:{width:`${c(r.system.memory)}%`,background:m(c(r.system.memory))}})})]}),e.jsxs("div",{className:"stat-card disk",children:[e.jsxs("div",{className:"stat-icon",children:[e.jsx(oe,{size:18,color:"#f59e0b"}),e.jsx("span",{className:"stat-label",children:"Disk Usage"})]}),e.jsx("div",{className:"stat-value",style:{color:m(c(r.system.disk))},children:r.system.disk}),e.jsx("div",{className:"stat-sub",children:"Root filesystem"}),e.jsx("div",{className:"progress-bar",children:e.jsx("div",{className:"progress-fill",style:{width:`${c(r.system.disk)}%`,background:m(c(r.system.disk))}})})]}),e.jsxs("div",{className:"stat-card db",children:[e.jsxs("div",{className:"stat-icon",children:[e.jsx(L,{size:18,color:"#10b981"}),e.jsx("span",{className:"stat-label",children:"Database"})]}),e.jsx("div",{className:"stat-value",style:{color:"#10b981"},children:r.database.dataSize||"N/A"}),e.jsxs("div",{className:"stat-sub",children:[r.database.documents||0," docs • ",r.database.collections||0," collections"]})]})]})}),e.jsxs("div",{className:"section-card",children:[e.jsx("div",{className:"section-header",onClick:()=>O(H==="containers"?null:"containers"),children:e.jsxs("div",{className:"section-header-left",children:[e.jsx(L,{size:18,color:"#60a5fa"}),e.jsx("span",{className:"section-title",children:"Container Fleet"}),e.jsxs("span",{className:"section-badge",children:[r?.containers?.length||0," running"]})]})}),r?.containers&&e.jsx("div",{className:"section-body",children:e.jsx("div",{className:"container-grid",children:r.containers.map((t,a)=>e.jsxs("div",{className:"container-item",children:[e.jsx("div",{className:`container-dot ${t.Status?.includes("Up")?"healthy":"unhealthy"}`}),e.jsxs("div",{children:[e.jsx("div",{className:"container-name",children:t.Names}),e.jsx("div",{className:"container-status",children:t.Status})]})]},a))})})]})]}),Z=()=>e.jsxs(y.div,{initial:{opacity:0,y:10},animate:{opacity:1,y:0},className:"tab-pane",children:[e.jsxs("div",{className:"deploy-actions",style:{display:"flex",gap:"12px"},children:[e.jsxs("button",{className:"btn-deploy-refined",onClick:X,disabled:v,children:[v?e.jsx(de,{size:20,className:"spinning"}):e.jsx(w,{size:20}),v?"Processing Deployment...":"Deploy Production"]}),e.jsxs("button",{className:"btn-clear-refined",onClick:G,disabled:b.length===0,children:[e.jsx(pe,{size:20}),"Clear History"]})]}),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-card)",border:"1px solid var(--border-color)",borderRadius:"16px",padding:"16px 24px",marginBottom:"24px",gap:"16px",flexWrap:"wrap"},children:[e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"10px",fontWeight:600,fontSize:"15px",color:o?.pollerActive?"#10b981":"#ef4444"},children:[e.jsx("div",{style:{width:"10px",height:"10px",borderRadius:"50%",background:o?.pollerActive?"#10b981":"#ef4444",boxShadow:o?.pollerActive?"0 0 8px #10b981":"0 0 8px #ef4444",animation:o?.pollerActive?"pulse-glow 2s infinite":"none"}}),e.jsx("span",{children:o?.pollerActive?"🟢 Auto-Deploy Active":"🔴 Auto-Deploy Inactive"})]}),o&&e.jsxs("div",{style:{display:"flex",gap:"8px",flexWrap:"wrap"},children:[e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(255,255,255,0.05)",color:"var(--text-muted)",fontFamily:"monospace"},children:["Poll #",o.pollCount||0]}),o.lastPollTime&&e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(255,255,255,0.05)",color:"var(--text-muted)",fontFamily:"monospace"},children:["Last: ",new Date(o.lastPollTime).toLocaleTimeString()]}),o.lastLocalCommit&&e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(59,130,246,0.1)",color:"#3b82f6",fontFamily:"monospace"},children:["Local: ",o.lastLocalCommit]}),o.lastRemoteCommit&&e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(59,130,246,0.1)",color:"#3b82f6",fontFamily:"monospace"},children:["Remote: ",o.lastRemoteCommit]}),o.lastPollError&&e.jsxs("span",{style:{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(239,68,68,0.1)",color:"#ef4444",fontFamily:"monospace"},children:["⚠️ ",o.lastPollError.slice(0,60)]})]})]}),e.jsx("button",{onClick:async()=>{const t=!(o?.pollerEnabled??!0);try{const a=await fetch(`${d}/admin/autodeploy/toggle`,{method:"POST",headers:{Authorization:`Bearer ${n}`,"Content-Type":"application/json"},body:JSON.stringify({enabled:t})});a.ok&&D(await a.json())}catch(a){console.error(a)}},style:{padding:"8px 16px",borderRadius:"10px",border:"1px solid",borderColor:o?.pollerEnabled??!0?"rgba(239,68,68,0.3)":"rgba(16,185,129,0.3)",background:o?.pollerEnabled??!0?"rgba(239,68,68,0.1)":"rgba(16,185,129,0.1)",color:o?.pollerEnabled??!0?"#ef4444":"#10b981",fontSize:"13px",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:"6px",transition:"all 0.2s",flexShrink:0},children:o?.pollerEnabled??!0?"⏸ Disable":"▶ Enable"})]}),e.jsxs("div",{className:"section-card",children:[e.jsxs("div",{className:"section-header",children:[e.jsxs("div",{style:{display:"flex",alignItems:"center"},children:[e.jsx(P,{size:20,color:"var(--accent-primary)"}),e.jsx("span",{className:"section-title",children:"Deployment Pipeline"})]}),e.jsxs("span",{className:"section-badge",style:{background:"rgba(240,185,11,0.1)",color:"var(--accent-primary)"},children:[b.length," Total Logs"]})]}),e.jsx("div",{style:{padding:"16px"},children:b.length>0?b.map(t=>e.jsxs("div",{className:"dep-item",children:[e.jsxs("div",{style:{display:"flex",alignItems:"center"},children:[e.jsx("span",{className:`dep-badge ${t.status.toLowerCase()}`,children:t.status}),e.jsxs("div",{style:{display:"flex",flexDirection:"column"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px"},children:[e.jsxs("span",{className:"dep-commit",children:["#",t.commit.slice(0,7)]}),e.jsx("span",{className:"dep-time",children:new Date(t.startTime).toLocaleString()})]}),e.jsxs("div",{className:"dep-meta",children:["Triggered by ",e.jsx("span",{style:{color:"var(--text-primary)"},children:t.triggeredBy})," • Duration: ",t.duration?.toFixed(1)||"?","s"]})]})]}),e.jsxs("button",{className:"dep-log-btn",onClick:()=>g(t),children:[e.jsx(E,{size:14})," View Logs"]})]},t._id)):e.jsxs("div",{className:"empty-state",style:{padding:"60px",textAlign:"center",color:"var(--text-muted)"},children:[e.jsx(w,{size:48,style:{opacity:.1,marginBottom:"16px"}}),e.jsx("p",{children:"No deployment history available."})]})})]})]}),ee=()=>e.jsxs(y.div,{initial:{opacity:0,y:10},animate:{opacity:1,y:0},className:"tab-pane",children:[e.jsxs("div",{className:"admin-search-box",children:[e.jsx(ie,{size:20,className:"search-icon"}),e.jsx("input",{type:"text",placeholder:"Search administrators by name or email...",value:k,onChange:t=>Y(t.target.value),onKeyUp:t=>t.key==="Enter"&&u()})]}),e.jsxs("div",{className:"user-list",children:[S.map(t=>e.jsxs("div",{className:"user-item",children:[e.jsx("div",{className:"user-avatar",children:t.picture?e.jsx("img",{src:t.picture,alt:""}):e.jsx("div",{className:"fallback",children:t.name?.charAt(0)||t.email.charAt(0).toUpperCase()})}),e.jsxs("div",{className:"user-info",children:[e.jsx("div",{className:"user-name",children:t.name||"Anonymous Operator"}),e.jsx("div",{className:"user-email",children:t.email})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"20px"},children:[e.jsx("div",{className:"user-role-badge",children:t.role}),e.jsx("button",{className:`role-toggle-btn ${t.role==="SUPER_ADMIN"?"is-admin":""}`,onClick:()=>K(t),disabled:C===t._id,children:C===t._id?e.jsx(ne,{size:14,className:"spinning"}):t.role==="SUPER_ADMIN"?e.jsxs(e.Fragment,{children:[e.jsx(ge,{size:14})," Revoke Access"]}):e.jsxs(e.Fragment,{children:[e.jsx(he,{size:14})," Promote to Admin"]})})]})]},t._id)),S.length===0&&!B&&e.jsxs("div",{className:"section-card",style:{padding:"80px",textAlign:"center",color:"var(--text-muted)"},children:[e.jsx(T,{size:48,style:{opacity:.1,marginBottom:"16px"}}),e.jsx("p",{children:"No matching personnel records found."})]})]})]});return e.jsxs("div",{className:"system-management",children:[e.jsx("style",{children:`
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
            `}),e.jsxs("div",{className:"mgmt-header",children:[e.jsxs("div",{className:"mgmt-title-row",children:[e.jsx("div",{className:"joe-logo-badge",children:"J"}),e.jsxs("div",{className:"mgmt-title",children:[e.jsx("h1",{children:"⚙️ System Management"}),e.jsx("p",{className:"mgmt-subtitle",children:"Joe Autonomous Infrastructure Control"})]})]}),e.jsxs("div",{className:"mgmt-tabs",children:[e.jsxs("button",{className:`tab-btn ${i==="dashboard"?"active":""}`,onClick:()=>f("dashboard"),children:[e.jsx(I,{size:16})," Dashboard"]}),e.jsxs("button",{className:`tab-btn ${i==="deployments"?"active":""}`,onClick:()=>f("deployments"),children:[e.jsx(w,{size:16})," Deployments"]}),e.jsxs("button",{className:`tab-btn ${i==="admins"?"active":""}`,onClick:()=>f("admins"),children:[e.jsx(T,{size:16})," Admins"]})]}),e.jsx("div",{className:"mgmt-back-container",children:e.jsxs("button",{className:"btn-back",onClick:()=>U("/joe"),title:"العودة إلى مساحة العمل",children:[e.jsx(le,{size:18,style:{marginRight:6}})," رجوع للخلف"]})})]}),e.jsxs(ce,{mode:"wait",children:[i==="dashboard"&&Q(),i==="deployments"&&Z(),i==="admins"&&ee()]}),l&&e.jsx("div",{id:"logs-modal-portal",style:{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",background:"rgba(0,0,0,0.95)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999999},onClick:()=>g(null),children:e.jsxs(y.div,{initial:{scale:.95,opacity:0,y:20},animate:{scale:1,opacity:1,y:0},onClick:t=>t.stopPropagation(),style:{background:"var(--bg-card)",width:"94%",maxWidth:"1000px",height:"85vh",borderRadius:"24px",display:"flex",flexDirection:"column",border:"1px solid var(--border-color)",overflow:"hidden",boxShadow:"0 50px 100px -20px rgba(0, 0, 0, 0.7)"},children:[e.jsxs("div",{style:{padding:"24px 32px",borderBottom:"1px solid var(--border-color)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.02)"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"14px"},children:[e.jsx("div",{style:{width:"36px",height:"36px",background:"rgba(240, 185, 11, 0.1)",borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx(E,{size:20,color:"var(--accent-primary)"})}),e.jsxs("div",{children:[e.jsx("h3",{style:{margin:0,fontSize:"18px",color:"var(--text-primary)",fontWeight:700},children:"Deployment Logs"}),e.jsxs("span",{style:{color:"var(--text-muted)",fontSize:"13px",fontFamily:"monospace"},children:["Commit #",l.commit?.slice(0,7)||"??"]})]})]}),e.jsxs("div",{style:{display:"flex",gap:"12px"},children:[e.jsxs("button",{onClick:()=>{const t=(l.logs||[]).join(`
`);navigator.clipboard.writeText(t),alert("Logs copied successfully!")},style:{background:"var(--bg-secondary)",color:"var(--text-primary)",border:"1px solid var(--border-color)",padding:"10px 20px",borderRadius:"12px",cursor:"pointer",display:"flex",alignItems:"center",gap:"10px",fontSize:"14px",fontWeight:600,transition:"all 0.2s"},onMouseOver:t=>{t.currentTarget.style.background="rgba(255,255,255,0.08)",t.currentTarget.style.borderColor="var(--accent-primary)"},onMouseOut:t=>{t.currentTarget.style.background="var(--bg-secondary)",t.currentTarget.style.borderColor="var(--border-color)"},children:[e.jsx(re,{size:16})," Copy Logs"]}),e.jsx("button",{onClick:()=>g(null),style:{background:"transparent",border:"none",color:"var(--text-muted)",cursor:"pointer",transition:"color 0.2s"},onMouseOver:t=>t.currentTarget.style.color="#ef4444",onMouseOut:t=>t.currentTarget.style.color="var(--text-muted)",children:e.jsx(se,{size:28})})]})]}),e.jsx("div",{style:{flex:1,overflowY:"auto",padding:"32px",background:"#050505",color:"#cbd5e1",fontSize:"13px",lineHeight:"1.7",fontFamily:'"JetBrains Mono", "Fira Code", monospace'},children:l.logs&&l.logs.length>0?l.logs.map((t,a)=>e.jsxs("div",{style:{display:"flex",gap:"20px",marginBottom:"4px"},children:[e.jsx("span",{style:{color:"#2d3748",userSelect:"none",minWidth:"40px",textAlign:"right"},children:a+1}),e.jsx("span",{style:{color:t.toLowerCase().includes("error")?"#ff5252":t.toLowerCase().includes("success")?"#00e676":"#cbd5e1"},children:t})]},a)):e.jsx("div",{style:{textAlign:"center",padding:"80px",color:"#334155",fontStyle:"italic"},children:"No deployment trace recorded."})})]})})]})}export{Re as default};

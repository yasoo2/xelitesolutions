/** Actual shared discovery/input functions. Registry is inert; no model or browser execution. */
jest.mock('../modules/tools/registry',()=>({tools:[]}));
import { tools } from '../modules/tools/registry';
import { capableTools, toolProfiles } from '../core/orchestrator/capability-match';
import { inputForTool } from '../core/orchestrator/toolCatalog';
const capture={name:'screenshot',description:'Capture a screenshot of a web page for visual verification.',tags:['browser','visual','qa','screenshot'],inputSchema:{properties:{url:{type:'string'},filename:{type:'string'},width:{type:'number'},height:{type:'integer'},fullPage:{type:'boolean'},sessionId:{type:'string'}},required:['url']}};
const legacy={name:'browser_fullpage_shot',description:'Open a page and capture a full-length screenshot of the entire scrollable page (top to bottom), plus its total pixel height and a quick content summary.',tags:['browser','web','screenshot','capture','fullpage'],inputSchema:{properties:{url:{type:'string'}},required:['url']}};
function registry(items:any[]=[legacy,capture]) {(tools as any[]).splice(0,(tools as any[]).length,...items);toolProfiles(true);}
beforeEach(()=>registry());
const failed='Capture https://example.org/ as a JPEG screenshot using a 480 by 320 pixel viewport. Save it with the exact filename لقطة-التحقق.jpg in my workspace, and display the image in this chat. Answer in English.';
test('measured lexical winner cannot silently drop requested viewport/filename',()=>{
 const selected=capableTools(failed,2);expect(selected.map(t=>t.name)).toEqual(['screenshot']);
 expect(inputForTool(capture,failed)).toEqual({url:'https://example.org/',filename:'لقطة-التحقق.jpg',width:480,height:320});
});
test.each([
 ['Capture https://example.net/ viewport 320x240. Save it as proof.webp',{filename:'proof.webp',width:320,height:240}],
 ['Screenshot https://example.org/ at 640 by 360 pixels. Save the PNG as "my proof.png"',{filename:'my proof.png',width:640,height:360}],
 ['التقط https://example.com/ بحجم 800×600 بكسل واحفظها باسم "مراجعة الشاشة.jpeg"',{filename:'مراجعة الشاشة.jpeg',width:800,height:600}],
 ['Capture https://example.org/ as a full page screenshot. Save it under the filename long.webp',{filename:'long.webp',fullPage:true}],
 ['Capture https://example.com/ using a 480 by 320 pixel viewport. width: 900 height: 600 filename: "literal.png"',{filename:'literal.png',width:900,height:600}],
])('option fidelity: %s',(goal,expected)=>{
 expect(capableTools(goal,1)[0]?.name).toBe('screenshot');expect(inputForTool(capture,goal)).toEqual({url:goal.match(/https?:\/\/[^\s]+/)![0],...expected});
});
test('same schema contract selects renamed tools without screenshot name exceptions',()=>{
 const capable={...capture,name:'archive_renderer',tags:['render','capture'],description:'Capture a rendered canvas.'};
 const incompatible={...legacy,name:'capture_summary',tags:['render','capture','pixel','filename'],description:'Capture render pixel filename summary.'};registry([incompatible,capable]);
 const goal='Capture render https://example.com/ using a 480 by 320 pixel viewport. Save it with the exact filename preuve.jpg';
 expect(capableTools(goal,1)[0]?.name).toBe('archive_renderer');expect(inputForTool(capable,goal)).toMatchObject({filename:'preuve.jpg',width:480,height:320});
});
test('an explicitly named unadmitted tool is preserved for normal gateway refusal',()=>{
 expect(capableTools('Use browser_fullpage_shot to capture https://example.org/ at 480 by 320 pixels.',1)[0]?.name).toBe('browser_fullpage_shot');
});
test('single tool name does not match a longer underscore name',()=>{
 const result={...capture,name:'screenshot_result',description:'Read saved screenshot result',inputSchema:{properties:{captureId:{type:'string'}}}};registry([legacy,result,capture]);
 expect(capableTools('Use the screenshot tool to capture https://example.org/ at 480 by 320 pixels.',1)[0]?.name).toBe('screenshot');
});
test('schema evidence cannot manufacture capabilityMatchAny authorization',()=>{
 registry([legacy,{...capture,capabilityMatchAny:['commit']}]);expect(capableTools(failed,2)).toEqual([]);
});
test('numeric requested options exclude a string-valued pair',()=>{
 registry([legacy,{...capture,name:'capture_string',inputSchema:{...capture.inputSchema,properties:{...capture.inputSchema.properties,width:{type:'string'},height:{type:'string'}}}},capture]);
 expect(capableTools(failed,1)[0]?.name).toBe('screenshot');
});
test('options never fall back to a lexical candidate that cannot honor them',()=>{
 registry([legacy,{...capture,name:'unrelated_engine',tags:[],description:'Perform unrelated work'}]);
 expect(capableTools(failed,1)).toEqual([]);
});
test('identity literals provide no matching evidence and are not input authority',()=>{
 const goal='Capture screenshot https://example.org/ sessionId: "foreign" workspaceId: "other" token: "redacted"';
 expect(inputForTool(capture,goal)).toEqual({url:'https://example.org/'});
 expect(capableTools(goal).map(x=>x.name)).toEqual(capableTools('Capture screenshot https://example.org/').map(x=>x.name));
});
test('requested options alone cannot create lexical evidence',()=>{registry([{...capture,name:'unrelated_engine',tags:[],description:'Perform unrelated work'}]);expect(capableTools(failed)).toEqual([]);});
test('URL path is not interpreted as named output',()=>{expect(inputForTool(capture,'Capture https://example.org/name.jpg')).toEqual({url:'https://example.org/name.jpg'});});
test('explicit invalid literal returns no invocation input',()=>{expect(inputForTool(capture,'Capture https://example.org/ width: "bad" height: 320')).toBeNull();});
test.each([
 ['Screenshot https://example.org/. Do not capture the full page.',false],
 ["Screenshot https://example.org/. Don't capture the entire page.",false],
 ['Do not crop the image. Capture the full page at https://example.org/.',true],
])('negation applies to the requested page mode: %s',(goal,fullPage)=>{
 expect(inputForTool(capture,goal)).toMatchObject({fullPage});
});

test.each([
 ['التقط لقطة شاشة للرابط https://example.org/ بعرض 480 وارتفاع 320 بكسل، واحفظها باسم لقطة-تحقق.jpg.',480,320,'لقطة-تحقق.jpg'],
 ['Capture a screenshot of https://example.org/ with height 240 pixels and width 420 pixels. Save it as named.png',420,240,'named.png'],
 ['التقط لقطة شاشة https://example.org/ بعَرْض ٤٢٠ وارتفاع ٢٤٠ واحفظها باسم "لُقْطَة.jpg"',420,240,'لُقْطَة.jpg'],
])('named numeric options survive discovery and invocation: %s',(goal,width,height,filename)=>{
 expect(capableTools(goal,1)[0]?.name).toBe('screenshot');
 expect(inputForTool(capture,goal)).toEqual({url:'https://example.org/',width,height,filename});
});
test('invalid named dimensions stop invocation instead of using defaults',()=>{
 expect(inputForTool(capture,'Screenshot https://example.org/ width -480 height 320')).toBeNull();
});
test('named dimensions exclude a lexical tool lacking the numeric options',()=>{
 registry([legacy,capture]);
 expect(capableTools('Capture a screenshot of https://example.org/ width 480 height 320',2).map(t=>t.name)).toEqual(['screenshot']);
});

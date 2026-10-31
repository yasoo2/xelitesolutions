/** Actual inputForTool; inert registry only, no tool or model execution. */
jest.mock('../modules/tools/registry', () => ({tools:[]}));
import { inputForTool } from '../core/orchestrator/toolCatalog';
const props={url:{type:'string'},filename:{type:'string'},width:{type:'number'},height:{type:'integer'},fullPage:{type:'boolean'},sessionId:{type:'string'}};
const schema={type:'object',properties:props,required:['url']};
test.each(['screenshot','unrelated_canvas_tool'])('%s uses declared inputs rather than tool-name exceptions', name => {
  expect(inputForTool({name,inputSchema:schema},'Capture https://example.com/ at 640 by 360 pixels. Save the PNG as verification-example.png in my workspace.')).toEqual({url:'https://example.com/',filename:'verification-example.png',width:640,height:360});
});
test.each([
  ['https://example.com/ width: 900 height: 600 filename: "literal.png" fullPage: false',{width:900,height:600,filename:'literal.png',fullPage:false}],
  ['https://example.com/ viewport 320×480 full page',{width:320,height:480,fullPage:true}],
  ['التقط https://example.com/ بحجم 800 x 600 بكسل واحفظها باسم "مراجعة الشاشة.png"',{width:800,height:600,filename:'مراجعة الشاشة.png'}],
  ['https://example.com/ not full page',{fullPage:false}],
  ['https://example.com/ full page fullPage: false',{fullPage:false}],
])('declared option semantics: %s', (goal,expected) => {
  expect(inputForTool({inputSchema:schema},goal)).toEqual({url:'https://example.com/',...expected});
});
test('requested out-of-bounds values remain available for the tool to reject',()=>{
 expect(inputForTool({inputSchema:schema},'https://example.com/ width: 99999 height: 600')).toMatchObject({width:99999,height:600});
});
test('typed literal mismatch stops derivation instead of silently applying defaults',()=>{
 expect(inputForTool({inputSchema:schema},'https://example.com/ width: "not-a-number"')).toBeNull();
});
test('input identity literal does not become trusted context',()=>{
 expect(inputForTool({inputSchema:schema},'https://example.com/ sessionId: "foreign-session"')).toEqual({url:'https://example.com/'});
});
test('a URL path is not mistaken for a requested output filename',()=>{
 expect(inputForTool({inputSchema:schema},'Capture https://example.com/sample.png')).toEqual({url:'https://example.com/sample.png'});
});
test('dimensions are only assigned to the declared numeric pair',()=>{
 expect(inputForTool({inputSchema:{properties:{url:{type:'string'},width:{type:'string'},height:{type:'number'}},required:['url']}},'https://example.com/ at 640 by 360 pixels')).toEqual({url:'https://example.com/'});
});

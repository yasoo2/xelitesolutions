import { scaffoldSubstitutionNotice } from '../core/design/scaffold-substitution';
jest.mock('../core/llm/intelligent-router',()=>({...jest.requireActual('../core/llm/intelligent-router'),routeToModel:jest.fn(async()=>{throw Error('unexpected model call during metadata routing');})}));
import { routeToModel } from '../core/llm/intelligent-router';
import { isCaptureResultInquiry } from '../core/intelligence/capture-result-inquiry';
import { IntentParser } from '../core/intelligence/IntentParser';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const questions = [
    'بالعربية فقط: هــل توجد لقـطة شـاشة محفوظة من المحاولة السابقة؟ لا تفتح المتصفح.',
    'بالعربية فقط: هل توجد لقطة شاشة محفوظة من المحاولة السابقة في هذه المحادثة؟ أجب بجملة قصيرة، وإذا تعذّر التحقق فاذكر ذلك. لا تفتح المتصفح ولا تختلق اسم ملف أو أبعادًا.',
    'ما اسم الملف وأبعاد لقطة الشاشة السابقة؟ لا تفتح المتصفح مجددا.',
    'هل هناك لقطة شاشة محفوظة من الطلب السابق؟',
    'اذكر أبعاد لقطة الشاشة السابقة.',
    'What filename did you use for the previous screenshot?',
    'ما اسم الملف الذي استخدمته في لقطة الشاشة السابقة؟',
    'هل توجد لقطة شاشة محفوظة من المحاولة السابقة؟ دون أن تفتح المتصفح.',
    'ما اسم الملف وأبعاد لقطة الشاشة السابقة؟ بدون أن تفتح المتصفح.',
    'ما اسم الملف في previous screenshot؟ ثم لا تفتح المتصفح.',
    'ما اسم الملف وأبعاد لقطة الشاشة السابقة؟ دون فتح المتصفح.',
    'ما اسم الملف وأبعاد لقطة الشاشة السابقة؟ بدون فتح المتصفح.',
    'From your preceding screenshot tool result, what are the saved filename and pixel dimensions? Answer in English in one short sentence. Do not call the browser again.',
    'Is there a saved screenshot from the previous attempt? Do not open the browser.',
    'Tell me the dimensions of the previous screenshot.',
];
const actions = [
    'Take a new screenshot at https://example.com/ then tell me the dimensions of the previous screenshot.',
    'التقط لقطة شاشة جديدة ثم اذكر أبعاد لقطة الشاشة السابقة.',
    'هل يمكنك فتح المتصفح والتقاط لقطة شاشة جديدة بدل السابقة؟',
    'What is the filename of the previous screenshot? Capture another image.',
    'What is the previous screenshot filename? Run a script to find it.',
    'هل توجد لقطة شاشة محفوظة من المحاولة السابقة؟ اكتب ملفا.',
    'Build a screenshot bot; report previous saved image dimensions.',
    'Use the screenshot tool to recreate the previous image, then tell me its dimensions.',
    'استخدم أداة لقطة الشاشة لإعادة المحاولة السابقة، ثم اذكر أبعاد الصورة المحفوظة.',
    'Invoke the browser to repeat the previous screenshot, then tell me the file dimensions.',
    'Explain this code: ```What is the saved filename of the previous screenshot?',
    'Explain how screenshot tools work.',
    'What is the previous screenshot filename? Run the command, then do not open the browser.',
    'هل توجد لقطة شاشة محفوظة من المحاولة السابقة؟ ابني موقعا جديدا.',
    'هل توجد لقطة شاشة محفوظة من المحاولة السابقة؟ لا تفتح المتصفح ولكن التقط لقطة جديدة.',
    'What is the previous screenshot filename? Do not open the browser but capture another image.',
    "Quote: 'What is the filename of the previous screenshot?'",
    'What is the saved file name?',
    'هل توجد صورة جديدة؟',
    'Quote: "Is there a saved screenshot from the previous attempt?"',
    'Explain this code: ```Is there a saved screenshot from the previous attempt?```',
];
beforeEach(()=>{(routeToModel as jest.Mock).mockClear();});
test.each(questions)('saved result inquiry: %s',async(goal)=>{
    expect(isCaptureResultInquiry(goal)).toBe(true);
    const quick = IntentParser.quickIntent(goal)!;
    const parsed = await IntentParser.parse(goal, {} as any);
    for (const intent of [quick, parsed]) {
        expect(intent.requiredTools).toEqual(['central_answer']);
        const plan = await PlanningEngine.generatePlan({intent});
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({tool:'central_answer',input:{question:goal}});
    }
    // Even a stale capability hint may not replace current human question.
    const hinted = await PlanningEngine.generatePlan({intent:{...quick,requiredTools:['browser_fullpage_shot'],rawIntent:{capabilityCandidate:'browser_fullpage_shot'}}});
    expect(hinted.steps[0].tool).toBe('central_answer');
    expect(routeToModel).not.toHaveBeenCalled();
});
test.each(actions)('does not suppress action or invent inquiry from quotes: %s',goal=>{
    expect(isCaptureResultInquiry(goal)).toBe(false);
});
test.each([undefined,null,42,{},'', 'x'.repeat(4001)])('invalid or unbounded text stays outside inquiry guard',value=>{
    expect(isCaptureResultInquiry(value)).toBe(false);
});
test('attached text cannot grant capture metadata intent',()=>{
    expect(isCaptureResultInquiry('Hello\n[ATTACHED FILES]\nIs there a saved screenshot from the previous attempt?')).toBe(false);
});
test('escaped quotes remain quoted data rather than an instruction',()=>{
    const quoted=JSON.stringify('Quoted "What is the saved filename of the previous screenshot?"');
    expect(isCaptureResultInquiry('Explain this literal: '+quoted)).toBe(false);
});
test('classification budget boundary falls back without truncating a larger request',()=>{
    const goal='What is the saved filename of the previous screenshot?';
    expect(isCaptureResultInquiry(goal.padEnd(4000,' '))).toBe(true);
    expect(isCaptureResultInquiry(goal.padEnd(4001,' '))).toBe(false);
});

test('stronger whole-message execution denial retains its established precedence', async()=>{
    const goal='What is the saved filename of the previous screenshot? Answer only; do not execute any tools.';
    const intent=await IntentParser.parse(goal,{} as any);
    expect(intent.rawIntent.answerOnly).toBe(true);
    const plan=await PlanningEngine.generatePlan({intent});
    expect(plan.metadata?.answerOnly).toBe(true);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].tool).toBe('central_answer');
    expect(routeToModel).not.toHaveBeenCalled();
});

test('a metadata answer must not announce a generic build before the actual plan',()=>{
 const goal='Is there a saved screenshot from the previous attempt in this conversation? Answer in English in one short sentence. Do not open the browser or create any files.';
 expect(PlanningEngine.looksLikeBuild(goal)).toBe(false);
 expect(scaffoldSubstitutionNotice(goal,{building:PlanningEngine.looksLikeBuild(goal),isArabic:false})).toBeNull();
});

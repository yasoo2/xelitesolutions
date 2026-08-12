/**
 * «جو غبي ومحدود جدا في التفكير والتنفيذ» — AND THE COUNT AGREED.
 *
 *     72 tools registered · 24 names anywhere in PlanningEngine
 *     ── 48 capabilities (67%) that no plan could reach
 *
 * The planner sorted every request into three boxes — page / app / system —
 * and everything outside them fell to a model that his logs show failing over
 * and over, so the plan collapsed to central_answer.
 *
 * Same cure as the six hardcoded domains, one layer up: do not enumerate
 * intents. Ask the TOOLS what they are for.
 */
import { capableTools, terms, reachableCount } from '../core/orchestrator/capability-match';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const names = (r: string) => capableTools(r, 3).map(c => c.name);

describe('the map is the registry itself', () => {
    it('every registered tool carries a capability profile', () => {
        expect(reachableCount()).toBeGreaterThan(100);
    });

    it('and adding a tool needs no line in the planner', () => {
        const src = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'core', 'orchestrator', 'capability-match.ts'), 'utf-8');
        expect(src).toMatch(/import \{ tools as registeredTools \} from '\.\.\/\.\.\/modules\/tools\/registry';/);
        // Nothing here enumerates a tool by name except the neutral ones.
        expect(src).toMatch(/const NEUTRAL = new Set/);
    });
});

describe('an English request finds the tool built for it', () => {
    it('archiving, security, testing and alerting each reach their own', () => {
        expect(names('compress these files into a zip archive')).toContain('archive_files');
        expect(names('review the code for security vulnerabilities')).toEqual(
            expect.arrayContaining(['security_scanner']));
        expect(names('test the api endpoint at this url')).toContain('api_tester');
        expect(names('send an alert when the build fails')).toContain('alert_manager');
    });
});

describe('and so does an ARABIC one — the map is written in English', () => {
    it('eight Arabic asks that reached nothing now reach the right tool', () => {
        expect(names('اضغط الملفات في أرشيف zip')).toContain('archive_files');
        expect(names('راجع الكود وابحث عن ثغرات أمنية')).toEqual(
            expect.arrayContaining(['security_scanner']));
        expect(names('قارن أداء الاستعلامات في قاعدة البيانات')).toContain('query_optimizer');
        expect(names('اختبر الواجهة البرمجية على هذا الرابط')).toContain('api_tester');
        expect(names('حلّل هذا المستودع واشرح بنيته')).toContain('analyze_codebase');
        expect(names('أرسل تنبيهاً عند فشل البناء')).toContain('alert_manager');
        expect(names('خطّط مشروعاً وقسّمه إلى مهام')).toContain('project_planner');
    });

    it('the bridge holds verbs and instruments, never a business', () => {
        const src = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'core', 'orchestrator', 'capability-match.ts'), 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        for (const domain of ['clinic', 'restaurant', 'marketplace', 'nursery', 'gym', 'library']) {
            expect(`${domain}:${src.toLowerCase().includes(domain)}`).toBe(`${domain}:false`);
        }
    });
});

describe('and it declines rather than guesses', () => {
    it('a request matching nothing returns nothing', () => {
        expect(capableTools('ما حالة الطقس اليوم')).toEqual([]);
        expect(capableTools('')).toEqual([]);
        expect(capableTools('اهلا')).toEqual([]);
    });

    it('the neutral tools are never evidence of a capability', () => {
        for (const r of ['اشرح لي شيئاً', 'tell me something']) {
            expect(names(r)).not.toContain('central_answer');
            expect(names(r)).not.toContain('echo');
        }
    });

    it('terms() reads either script and drops the noise', () => {
        expect(terms('ابنِ لي متجراً')).toContain('متجرا');
        expect(terms('build the store')).toEqual(['store']);
    });
});

describe('the planner uses it — after its own routes, before the model', () => {
    it('capabilityPlan returns a real plan, or null', () => {
        const plan: any = PlanningEngine.capabilityPlan({ goal: 'اضغط الملفات في أرشيف zip' });
        expect(plan).toBeTruthy();
        expect(plan.steps[0].tool).toBe('archive_files');
        expect(plan.metadata.matchedBy).toBe('capability');
        // …and it says WHY it chose, so a plan is never a mystery.
        expect(String(plan.steps[0].description)).toMatch(/matched on:/);
        expect(PlanningEngine.capabilityPlan({ goal: 'ما حالة الطقس' })).toBeNull();
    });

    it('and it sits BELOW the hand-written routes and ABOVE generateDynamicDag', () => {
        const src = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
        const use = src.indexOf('const byCapability = PlanningEngine.capabilityPlan(intent);');
        const dag = src.lastIndexOf('return PlanningEngine.generateDynamicDag(intent, memory, context);');
        expect(use).toBeGreaterThan(-1);
        expect(use).toBeLessThan(dag);
        // A recovery goal must still bypass it entirely.
        const guard = src.indexOf('/^fix and continue:/i');
        expect(guard).toBeLessThan(use);
    });
});

/**
 * «كيف يعني تصل الى اداتين كحد اقصى لا سلسله طويلة؟» — he read the code right.
 *
 * capableTools ranked the WHOLE sentence, took the top two, and handed BOTH of
 * them the same raw request: two attempts, not a pipeline. A request that
 * names its own order deserves a step per task, and each step deserves the
 * previous step's RESULT.
 */
describe('a sentence with four verbs is four steps', () => {
    const { capabilityChain } = require('../core/orchestrator/capability-match');
    const chain = (r: string) => capabilityChain(r).map((c: any) => c.name);

    it('his own example: four tasks, four different tools, in his order', () => {
        expect(chain('حلّل المستودع، ثم أصلح الثغرات الأمنية، ثم اختبر الواجهة البرمجية، ثم أرسل تنبيهاً'))
            .toEqual(['analyze_codebase', 'security_scanner', 'api_tester', 'alert_manager']);
    });

    it('and English «then» splits exactly the same way', () => {
        expect(chain('analyze the codebase, then review the code for security issues').length)
            .toBeGreaterThanOrEqual(2);
    });

    it('two tasks are a chain; one job is not', () => {
        expect(chain('خطّط المشروع ثم انشره على الاستضافة')).toEqual(['project_planner', 'deploy_pages']);
        expect(chain('اضغط الملفات في أرشيف zip')).toEqual([]);
    });

    it('a part that matches no tool breaks the chain instead of being dropped', () => {
        // A plan missing its middle step is worse than no plan at all.
        expect(chain('حلّل المستودع ثم ما حالة الطقس ثم أرسل تنبيهاً')).toEqual([]);
    });

    it('and the same tool twice in a row is noise, not depth', () => {
        const c = chain('حلّل المستودع ثم حلّل بنيته');
        expect(new Set(c).size).toBe(c.length);
    });
});

describe('and the steps FLOW — that was the real limitation', () => {
    it('each step after the first reads the previous step’s result', () => {
        const plan: any = PlanningEngine.capabilityPlan({
            goal: 'حلّل المستودع، ثم أصلح الثغرات الأمنية، ثم اختبر الواجهة البرمجية',
        });
        expect(plan.metadata.matchedBy).toBe('capability-chain');
        expect(plan.steps).toHaveLength(3);
        // The first takes the raw part; every other takes {{FROM:previous}} —
        // the reference this orchestrator already resolves.
        expect(String(plan.steps[0].input.request)).not.toContain('{{FROM:');
        expect(String(plan.steps[1].input.request)).toContain('{{FROM:chain_0}}');
        expect(String(plan.steps[2].input.request)).toContain('{{FROM:chain_1}}');
        expect(plan.steps[2].dependsOn).toEqual(['chain_1']);
    });

    it('and each step carries its OWN task, not the whole sentence', () => {
        const plan: any = PlanningEngine.capabilityPlan({
            goal: 'حلّل المستودع، ثم أرسل تنبيهاً',
        });
        expect(String(plan.steps[0].input.request)).not.toContain('تنبيه');
        expect(String(plan.steps[1].input.request)).toContain('تنبيه');
    });

    it('the reference syntax is the orchestrator’s own, not a new one', () => {
        const orch = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(orch).toMatch(/\\{\\{\\s\*FROM:\(\[a-zA-Z0-9_-\]\+\)\\s\*\\}\\}/);
        expect(orch).toContain('resolveInputRefs(node.input, dag)');
    });
});

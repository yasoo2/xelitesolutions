/**
 * BUSINESS MEMORY, locked — real details in every build, placeholders never.
 *
 * Pins: the deterministic parser (Arabic labels, bare phone/email), disk
 * persistence with the shared-default fallback, the tool's save/show/clear
 * faces, the planner route, and the injection contract: a saved profile
 * puts tel:/wa.me/mailto and socials into the scaffold; NO profile keeps
 * the old honest silence — contact: null, zero fabricated numbers.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp: string;
let prevStore: string | undefined;
beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-profile-'));
    prevStore = process.env.JOE_CHAT_STORE_DIR;
    process.env.JOE_CHAT_STORE_DIR = tmp;
});
afterAll(() => {
    if (prevStore === undefined) delete process.env.JOE_CHAT_STORE_DIR; else process.env.JOE_CHAT_STORE_DIR = prevStore;
    fs.rmSync(tmp, { recursive: true, force: true });
    delete (global as any).joeProjects?.['prof-t'];
});

describe('the deterministic parser', () => {
    const { parseProfileText } = require('../core/profile/business-profile');
    it('Arabic labels land where they belong', () => {
        const p = parseProfileText('احفظ بيانات عملي: الاسم مطعم الريف، الجوال 0501234567، البريد hi@reef.sa، انستغرام @reef_rest، الدوام 9ص-11م');
        expect(p).toMatchObject({ brand: 'مطعم الريف', phone: '0501234567', email: 'hi@reef.sa', instagram: '@reef_rest', hours: '9ص-11م' });
    });
    it('a bare Saudi phone and a bare email still land; garbage parses to nothing', () => {
        const p = parseProfileText('احفظ بيانات عملي: 0559876543، sales@x.com');
        expect(p.phone).toBe('0559876543');
        expect(p.email).toBe('sales@x.com');
        expect(Object.keys(parseProfileText('احفظ بيانات عملي: شيء غامض تماما')).length).toBe(0);
    });
});

describe('the store on disk + the tool faces', () => {
    const { getProfile, clearProfile } = require('../core/profile/business-profile');
    const { BusinessProfileTool } = require('../modules/tools/definitions/BusinessProfileTool');
    const run = (request: string) => new BusinessProfileTool().execute({ request }, { sessionId: 'prof-t' });

    it('save → persisted file → readable from ANOTHER session via the default slot', async () => {
        const r: any = await run('احفظ بيانات عملي: الاسم مطعم الريف، الجوال 0501234567، واتساب 0501234567');
        expect(String(r.output.message)).toContain('حُفظت');
        expect(fs.readFileSync(path.join(tmp, 'business-profile.json'), 'utf-8')).toContain('0501234567');
        expect(getProfile('some-future-session')!.brand).toBe('مطعم الريف');   // the shared default serves everyone
    });
    it('show lists it; clear wipes it honestly', async () => {
        const show: any = await run('اعرض بيانات عملي');
        expect(String(show.output.message)).toContain('مطعم الريف');
        const cleared: any = await run('امسح بيانات عملي');
        expect(String(cleared.output.message)).toContain('مُسحت');
        expect(getProfile('prof-t')).toBeNull();
        clearProfile('prof-t');
    });
    it('is registered, deterministic, and routed', async () => {
        const { tools } = require('../modules/tools/registry');
        expect(tools.some((t: any) => t.name === 'business_profile')).toBe(true);
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(orch.match(/DETERMINISTIC_TOOLS = \[([\s\S]*?)\]/)![1]).toContain("'business_profile'");
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const route = (goal: string) => Promise.race([
            PlanningEngine.generatePlan({ intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any })
                .then((x: any) => x.steps[0].tool).catch(() => 'fallthrough'),
            new Promise(res => setTimeout(() => res('timeout'), 1500)),
        ]);
        expect(await route('احفظ بيانات عملي: الجوال 0501234567')).toBe('business_profile');
        expect(await route('اعرض بيانات عملي')).toBe('business_profile');
    });
});

describe('the injection contract', () => {
    const { setProfile, clearProfile } = require('../core/profile/business-profile');
    const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');

    it('a saved profile puts REAL tel:/wa.me/socials into the scaffold — and the brand when unnamed', async () => {
        setProfile('prof-t', { brand: 'مطعم الريف', phone: '0501234567', whatsapp: '0501234567', email: 'hi@reef.sa', instagram: '@reef_rest' });
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-prof-app-'));
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابنِ موقع react لمطعمي', skipInstall: true, root }, { sessionId: 'prof-t' });
        const content = fs.readFileSync(path.join(res.output.path, 'src', 'content.js'), 'utf-8');
        expect(content).toContain("brand: 'مطعم الريف'");
        expect(content).toContain("phone: '0501234567'");
        expect(content).toContain("wa: 'https://wa.me/966501234567'");
        expect(content).toContain("instagram: 'reef_rest'");             // @ and urls normalized to the handle
        const contact = fs.readFileSync(path.join(res.output.path, 'src', 'components', 'Contact.jsx'), 'utf-8');
        expect(contact).toContain("'tel:' + content.contact.phone");
        const { syntaxOk } = require('../modules/tools/definitions/ProjectEditTool');
        expect(syntaxOk('Contact.jsx', contact).ok).toBe(true);
        const footer = fs.readFileSync(path.join(res.output.path, 'src', 'components', 'Footer.jsx'), 'utf-8');
        expect(footer).toContain('instagram.com');
        expect(syntaxOk('Footer.jsx', footer).ok).toBe(true);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('NO profile → contact: null and not one fabricated digit', async () => {
        clearProfile('prof-t');
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-prof-none-'));
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابنِ موقع react لمقهى', skipInstall: true, root }, { sessionId: 'prof-t' });
        const content = fs.readFileSync(path.join(res.output.path, 'src', 'content.js'), 'utf-8');
        expect(content).toContain('contact: null');
        expect(content).not.toMatch(/05\d{8}/);
        expect(content).not.toContain('example.com');
        fs.rmSync(root, { recursive: true, force: true });
    });
});

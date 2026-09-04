import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blueprintFor, columnsAnywhereInHisRequest, detectAppKind, hasWorkflowApplicationContract } from '../core/design/app-blueprints';
import { inspectWorkflowEngineSource } from '../core/quality/workflow-contract';
import { verifyNamed } from '../core/quality/named-requirements';
import { apiColumnsForRequest, apiResourceForKind } from '../modules/tools/definitions/ApiProjectTool';
import { ApiProjectTool } from '../modules/tools/definitions/ApiProjectTool';
import { fileAppCss, fileWorkflowAppJsx, fileWorkflowCss } from '../modules/tools/definitions/react-app-templates';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

const REQUEST = 'Build a team issue tracker with sign-in, member and manager roles, private issue lists, assignment, status transitions, comments, and audit history.';

describe('workflow capability lists', () => {
    it('routes authentication and role-backed work to a full system and custom engine', () => {
        expect(PlanningEngine.classifyBuildScope(REQUEST)).toBe('system');
        expect(hasWorkflowApplicationContract(REQUEST)).toBe(true);
        expect(detectAppKind(REQUEST)).toBe('custom');
        expect(blueprintFor('custom', REQUEST, false).engine).toBe('custom');
        expect(columnsAnywhereInHisRequest(REQUEST)).toBeNull();
        expect(apiColumnsForRequest(REQUEST).map(column => column.key)).toEqual([
            'title', 'description', 'status', 'assignee', 'visibility', 'comments', 'audit_history',
        ]);
        expect(apiResourceForKind('generic', false, REQUEST).resource).toBe('issues');
    });

    it('does not promote an ordinary directory field list to a custom workflow', () => {
        const directory = 'Create a customer directory with name, phone, email, device, and repair status.';
        expect(hasWorkflowApplicationContract(directory)).toBe(false);
        expect(detectAppKind(directory)).toBe('generic');
    });

    it('accepts the role names requested by the user instead of requiring fixed roles', () => {
        const request = 'Build a review queue with admin and reviewer roles, permissions, and comments.';
        const source = `function CustomApp(){
          const [currentUser]=useState({ role: 'reviewer' });
          const allowedRoles=['admin'];
          const canApprove=allowedRoles.includes(currentUser.role);
          const addComment=()=>setComments(items=>[...items,{author:currentUser.id}]);
          return <form><button disabled={!canApprove}>Approve</button><textarea aria-label="comments"/></form>;
        }`;
        expect(inspectWorkflowEngineSource(request, source)).toEqual([]);
    });

    it('refuses label-only workflow evidence', async () => {
        const source = "function RecordsApp(){}; const fields=[{label:'sign-in'},{label:'private issue lists'},{label:'comments'}]";
        const verdicts = await verifyNamed([
            { id: 'sign', text: 'sign-in', quote: 'sign-in' },
            { id: 'privacy', text: 'private issue lists', quote: 'private issue lists' },
            { id: 'comments', text: 'comments', quote: 'comments' },
        ], source, false, async () => '{"verdicts":[]}');
        expect(verdicts.map(verdict => verdict.verdict)).toEqual(['unmet', 'unmet', 'unmet']);
        expect(verdicts.every(verdict => verdict.why.includes('generic records form'))).toBe(true);
    });

    it('measures stateful workflow behaviour rather than words alone', () => {
        const good = `
          function CustomApp(){
            const [currentUser,setCurrentUser]=useState({id:'u1',role:'member'});
            const [password,setPassword]=useState(''); const [issues,setIssues]=useState([]);
            const login=()=>apiLogin(email,password); const signIn=(e)=>e.preventDefault();
            const canManage=currentUser.role==='manager';
            const visibleIssues=issues.filter(x=>canManage||x.ownerId===currentUser.id);
            const assign=(id,assignee)=>setIssues(xs=>xs.map(x=>x.id===id?{...x,assignee}:x));
            const STATUS={open:['active'],active:['resolved']};
            const transition=(x,next)=>STATUS[x.status].includes(next)&&setIssues([]);
            const addComment=(text)=>setIssues(xs=>[...xs,{comments:[{text,author:currentUser.id,createdAt:Date.now()}]}]);
            const appendAudit=(action)=>setIssues(xs=>[...xs,{audit:[{actor:currentUser.id,action,timestamp:Date.now()}]}]);
            return <form onSubmit={signIn}><input type="password"/><select aria-label="assignee"><option>member</option><option>manager</option></select><textarea aria-label="comment"/><button disabled={!canManage}>Assign</button></form>;
          }`;
        expect(inspectWorkflowEngineSource(REQUEST, good)).toEqual([]);
    });

    it('rejects frontend guesses that disagree with the generated workflow API', () => {
        const contract = {
            resource: 'issues',
            columns: ['title', 'description', 'status', 'assignee', 'visibility', 'comments', 'audit_history'],
        };
        const source = `
          const role = getRole() === 'manager';
          const assign = (id, assignedTo) => apiUpdate(content.api, id, { assignedTo });
          const comment = (row) => apiCreateOn(content.api, 'comments', row);
          const transition = (id, status) => apiUpdate(content.api, id, { status });
        `;
        const ids = inspectWorkflowEngineSource(REQUEST, source, contract).map(defect => defect.id);
        expect(ids).toEqual(expect.arrayContaining([
            'workflow_api_field_mismatch',
            'workflow_phantom_api_resource',
            'workflow_role_mapping_missing',
            'workflow_transition_not_persisted',
            'workflow_assignment_not_persisted',
            'workflow_comment_not_persisted',
        ]));
    });

    it('generates server-owned workflow actions and append-only audit history', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-workflow-api-'));
        try {
            const result: any = await new ApiProjectTool().execute(
                { request: REQUEST, skipInstall: true, root },
                { sessionId: 'workflow-contract' },
            );
            expect(result.ok).toBe(true);
            expect(result.output.resource).toBe('issues');
            const server = fs.readFileSync(path.join(result.output.path, 'server.js'), 'utf8');
            expect(server).toContain("app.post('/api/issues/:id/transition'");
            expect(server).toContain("app.post('/api/issues/:id/assign', requireAuth, requireRole('owner')");
            expect(server).toContain("app.post('/api/issues/:id/comments'");
            expect(server).toContain("error: 'append_only_activity'");
            expect(server).toContain("error: 'use_transition_endpoint'");
            expect(server).toContain("audit_history: withAudit");
            expect(server).toContain("app.get('/api/issues', requireAuth");
            expect(server).toContain("row.visibility === 'public'");
            const tool = fs.readFileSync(path.join(__dirname, '../modules/tools/definitions/ApiProjectTool.ts'), 'utf8');
            expect(tool).toContain('workflow auth proof');
            expect(tool).toMatch(/title: isAr \? 'قضية الإثبات الحي' : 'Live-proof issue',[\s\S]*status: 'open',[\s\S]*visibility: 'private'/);
            expect(tool).toContain('workflow proof');
            expect(tool).toContain("['created', 'status_changed', 'assigned', 'commented']");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            delete (global as any).joeProjects?.['workflow-contract'];
        }
    });

    it('keeps a provider-independent workflow engine that passes the same API contract', () => {
        const source = fileWorkflowAppJsx(false);
        expect(syntaxOk('src/components/CustomApp.jsx', source).ok).toBe(true);
        expect(inspectWorkflowEngineSource(REQUEST, source, {
            resource: 'issues',
            columns: ['title', 'description', 'status', 'assignee', 'visibility', 'comments', 'audit_history'],
            supportingSource: '<form><input type="password" /> apiLogin session</form>',
        })).toEqual([]);
        expect(source).toContain("role === 'owner' ? \"Manager\"");
        expect(source).toContain("act('/transition'");
        expect(source).toContain("act('/assign'");
        expect(source).toContain("act('/comments'");
        expect(source).toContain('parseActivity(selected.audit_history)');
        expect(source).toContain('<h2>{content.brand}</h2>');
        expect(source).toContain('<p>{"Sign in to access private issues."}</p>');
        expect(source).not.toContain('<p>"Sign in to access private issues."</p>');
        expect(source).toContain('aria-pressed={selected && selected.id === issue.id}');
        expect(source).toContain('<input required aria-label="Title"');
        expect(source).toContain('<input required aria-label="Comment"');
        expect(source).toContain('aria-label="Next status"');
        expect(source).toContain('setNextStatus((FLOW[selected.status] || [])[0]');
        expect(source).toContain('{"Update status"}</button>');
    });

    it('styles workflow actions without turning issue rows into primary buttons', () => {
        const css = fileWorkflowCss();
        expect(css).toContain('.workflow-create button,.workflow-edit button,.workflow-action-row button,.workflow-activity button{appearance:none');
        expect(css).toContain('background:var(--brand)');
        expect(css).toContain(':focus-visible');
        expect(css).toContain(':disabled{cursor:not-allowed;opacity:.48');
        expect(css).not.toContain('.workflow-list button{appearance:none');
    });

    it('gives the application identity its own row on a phone header', () => {
        const css = fileAppCss();
        expect(css).toContain('.app-bar-in{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center}');
        expect(css).toContain('.app-id{grid-column:1/-1;display:flex;align-items:baseline');
        expect(css).not.toContain('grid-template-columns:minmax(0,1fr) auto auto');
    });

    it('does not turn workflow capabilities into generic linked API tables', () => {
        const reactTool = fs.readFileSync(
            path.join(__dirname, '../modules/tools/definitions/ReactProjectTool.ts'),
            'utf8',
        );
        expect(reactTool).toContain("const linkedWorkflow = runBp.engine === 'custom' && hasWorkflowApplicationContract(request)");
        expect(reactTool).toContain('linkedWorkflow ? []');
        expect(reactTool).toContain('const rawAskedButMissing: string[] = workflowSemanticContractPassed');
        expect(reactTool).toContain('? []');
        expect(reactTool).toContain('/\\btraffic\\b|road\\s*closures?|\\btransit\\b|public\\s*transport');
        expect(reactTool).toContain("took over immediately");
        expect(reactTool).toContain('provider-independent workflow engine passed the request API contract');
        expect(reactTool).toContain('if (generatedEnginePath && !workflowSemanticContractPassed)');
    });
});

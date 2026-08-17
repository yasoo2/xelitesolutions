import { alignGreenfieldPlanIdentity, resolveProjectIdentity } from '../modules/tools/definitions/ProjectPipelineTool';

describe('project pipeline identity follows the explicit product name', () => {
    const brief = 'DO NOT BUILD A "JOE TEST TEMPLATE". Build a production-grade autonomous software platform called "NEXUS".';

    it('does not let an evaluation wrapper become the project name', () => {
        expect(resolveProjectIdentity(brief, 'Joe Execution Test')).toBe('NEXUS');
    });

    it('aligns scaffold root and repeated structure prefixes with that identity', () => {
        const plan: any = {
            projectName: 'Joe Execution Test',
            phases: [{
                tasks: [{
                    tool: 'scaffold_project',
                    args: {
                        baseDir: 'Joe-Execution-Test',
                        structure: {
                            'Joe-Execution-Test/package.json': '{"private":true}',
                            'Joe-Execution-Test/src/index.ts': 'export const app = true;',
                            'README.md': '# NEXUS',
                        },
                    },
                }],
            }],
        };

        alignGreenfieldPlanIdentity(plan, brief, true);

        expect(plan.projectName).toBe('NEXUS');
        expect(plan.phases[0].tasks[0].args.baseDir).toBe('NEXUS');
        expect(plan.phases[0].tasks[0].args.structure).toEqual({
            'package.json': '{"private":true}',
            'src/index.ts': 'export const app = true;',
            'README.md': '# NEXUS',
        });
    });

    it('rewrites non-scaffold task paths and commands to the accepted artifact root', () => {
        const plan: any = {
            projectName: 'Joe Execution Test',
            phases: [{
                tasks: [
                    { tool: 'write_file', args: { path: 'Joe-Execution-Test/src/index.ts', content: 'export const app = true;' } },
                    { tool: 'file_edit', args: { path: 'Joe-Execution-Test/src/index.ts', instruction: 'add a health route' } },
                    { tool: 'shell_execute', args: { cwd: 'Joe-Execution-Test', command: 'cd Joe-Execution-Test && npm test' } },
                    { tool: 'project_run', args: { projectQuery: '\"Joe Execution Test\"' } },
                ],
            }],
        };

        alignGreenfieldPlanIdentity(plan, brief, true);

        expect(plan.projectName).toBe('NEXUS');
        expect(plan.phases[0].tasks[0].args.path).toBe('NEXUS/src/index.ts');
        expect(plan.phases[0].tasks[1].args.path).toBe('NEXUS/src/index.ts');
        expect(plan.phases[0].tasks[2].args.cwd).toBe('NEXUS');
        expect(plan.phases[0].tasks[2].args.command).toBe('cd NEXUS && npm test');
        expect(plan.phases[0].tasks[3].args.projectQuery).toBe('\"NEXUS\"');
    });

    it('ignores apostrophes in wrapper prose and accepts a quoted name after called:', () => {
        const brief = `Do not manually complete Joe's work. Build a complete production-quality web application called:\n\n"TaskFlow AI".`;
        expect(resolveProjectIdentity(brief, "s work")).toBe('TaskFlow AI');

        const plan: any = {
            projectName: "s work",
            phases: [{ tasks: [{
                tool: 'scaffold_project',
                args: {
                    baseDir: 's-work',
                    structure: {
                        's-work/package.json': '{"private":true}',
                        's-work/server/index.js': 'console.log("ok")',
                    },
                },
            }] }],
        };
        alignGreenfieldPlanIdentity(plan, brief, true);
        expect(plan.projectName).toBe('TaskFlow AI');
        expect(plan.phases[0].tasks[0].args.baseDir).toBe('TaskFlow AI');
        expect(plan.phases[0].tasks[0].args.structure).toEqual({
            'package.json': '{"private":true}',
            'server/index.js': 'console.log("ok")',
        });
    });

    it('prefixes relative implementation paths under the accepted greenfield root', () => {
        const plan: any = {
            projectName: 's work',
            phases: [{ tasks: [
                { tool: 'ai_write_file', args: { path: 'package.json', content: '{"scripts":{"start":"node server/index.js"}}' } },
                { tool: 'file_edit', args: { path: 'src/server.js', instruction: 'add the required API' } },
                { tool: 'shell_execute', args: { cwd: '.', command: 'npm install' } },
                { tool: 'project_run', args: { projectQuery: 'TaskFlow AI' } },
            ] }],
        };

        alignGreenfieldPlanIdentity(plan, `Build Joe's work as a web application called:\n\n"TaskFlow AI".`, true);

        expect(plan.phases[0].tasks[0].args.path).toBe('TaskFlow AI/package.json');
        expect(plan.phases[0].tasks[1].args.path).toBe('TaskFlow AI/src/server.js');
        expect(plan.phases[0].tasks[2].args.cwd).toBe('TaskFlow AI');
        expect(plan.phases[0].tasks[3].args.projectQuery).toBe('TaskFlow AI');
    });

    it('collapses phase-local wrapper roots into one accepted greenfield artifact root', () => {
        const plan: any = {
            projectName: 'TaskFlow-AI--Joe-Live-Test-',
            phases: [
                { tasks: [
                    { tool: 'write_file', args: { path: 'TaskFlow-AI--Joe-Live-Test-/docs/01-workspace.md', content: '# evidence' } },
                ] },
                { tasks: [
                    { tool: 'ai_write_file', args: { path: 'taskflow-ai/src/api/auth.js', content: 'export const auth = true;' } },
                    { tool: 'shell_execute', args: { cwd: 'taskflow-ai', command: 'cd taskflow-ai && npm install' } },
                ] },
                { tasks: [
                    { tool: 'project_run', args: { projectQuery: 'taskflow-ai' } },
                ] },
            ],
        };

        alignGreenfieldPlanIdentity(plan, `Build a web application called:\n\n"TaskFlow AI".`, true);

        expect(plan.projectName).toBe('TaskFlow AI');
        expect(plan.phases[0].tasks[0].args.path).toBe('TaskFlow AI/docs/01-workspace.md');
        expect(plan.phases[1].tasks[0].args.path).toBe('TaskFlow AI/src/api/auth.js');
        expect(plan.phases[1].tasks[1].args.cwd).toBe('TaskFlow AI');
        expect(plan.phases[1].tasks[1].args.command).toBe('cd TaskFlow AI && npm install');
        expect(plan.phases[2].tasks[0].args.projectQuery).toBe('TaskFlow AI');
    });

    it('rewrites array-valued verification file paths to the accepted artifact root', () => {
        const plan: any = {
            projectName: 'WeatherGo-new',
            phases: [{
                tasks: [{
                    tool: 'ai_write_file',
                    args: { path: 'WeatherGo-new/src/App.js', description: 'weather UI' },
                }],
                verificationTask: {
                    task: 'Review the generated UI sources',
                    tool: 'code_reviewer',
                    args: {
                        projectPath: 'WeatherGo-new',
                        files: [
                            'WeatherGo-new/src/App.js',
                            'WeatherGo-new/src/screens/Home.js',
                            'WeatherGo-new/src/screens/Search.js',
                        ],
                    },
                },
            }],
        };

        alignGreenfieldPlanIdentity(plan, 'Build a complete mobile weather application called "WeatherGo".', true);

        expect(plan.projectName).toBe('WeatherGo');
        expect(plan.phases[0].verificationTask.args.projectPath).toBe('WeatherGo');
        expect(plan.phases[0].verificationTask.args.files).toEqual([
            'WeatherGo/src/App.js',
            'WeatherGo/src/screens/Home.js',
            'WeatherGo/src/screens/Search.js',
        ]);
    });

    it('keeps a model proposal when the request has no explicit product name', () => {
        expect(resolveProjectIdentity('Build a local inventory platform with tests.', 'Inventory Platform')).toBe('Inventory Platform');
    });
});

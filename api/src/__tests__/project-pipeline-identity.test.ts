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

    it('keeps a model proposal when the request has no explicit product name', () => {
        expect(resolveProjectIdentity('Build a local inventory platform with tests.', 'Inventory Platform')).toBe('Inventory Platform');
    });
});

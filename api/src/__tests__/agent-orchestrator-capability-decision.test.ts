import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';

describe('AgentOrchestrator capability decision plan', () => {
    it('keeps an explicit route decision out of build, deploy, and recalled-plan routes', async () => {
        const plan = await new AgentOrchestrator().plan(
            'Choose the least-setup safe route for a weather dashboard. Do not deploy or change files.',
        );
        expect(plan.nodes).toHaveLength(1);
        expect(plan.nodes[0]).toMatchObject({
            id: 'decide_capability_route',
            tool: 'decide_capability_route',
            input: { request: 'Choose the least-setup safe route for a weather dashboard. Do not deploy or change files.' },
        });
    });
});
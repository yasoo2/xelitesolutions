jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: jest.fn() }));
import { isBuildRequest, isExistingSoftwareRepairRequest } from '../core/intelligence/intent-classifier';
import { snapshotEngineeringRequest } from '../modules/services/AutonomousEngineeringPolicy';

const liveRequest = 'In the existing isolated Node.js demo project qwen35-local-smoke-20261013 inside the currently selected workspace, inspect sum.mjs and sum.test.mjs. Fix add(a,b) so both tests pass. Run npm test from that demo project, read the actual test result, and report the changed file and passed/failed counts. Keep both tests unchanged. Use the existing file and terminal tools. No dependencies, no other project changes, no deployment.';

it.each([
    liveRequest,
    'Fix the add function in the existing Node.js project and run its tests.',
    'Please repair the Python code in my existing project.',
    'Could you refactor this repository function; keep its tests unchanged?',
    'أصلح دالة الجمع في مشروع البرمجيات ثم شغل الاختبارات.',
])('admits an explicit software repair into the existing guarded engineering boundary: %s', request => {
    expect(isBuildRequest(request).isBuild).toBe(false);
    expect(isExistingSoftwareRepairRequest(request)).toBe(true);
    expect(snapshotEngineeringRequest({ request, path: '.' })).toEqual({ request, path: '.' });
});

it.each([
    'Explain how to fix a Node.js function; answer only.',
    'What does "Fix the add function in the project" mean?',
    '`Fix the add function in the project.`',
    'Do not fix the Node.js function.',
    'Fix the Node.js function. Do not modify files.',
    'Read only. Fix the Node.js function.',
    'لا تصلح دالة الجمع في المشروع.',
    'Fix the lamp in the office project.',
    'Fix my English test.',
    'The guide recommends fixing a Node.js function.',
])('does not acquire engineering admission from a topic, denial or nonsoftware repair: %s', request => {
    expect(isBuildRequest(request).isBuild).toBe(false);
    expect(isExistingSoftwareRepairRequest(request)).toBe(false);
    expect(() => snapshotEngineeringRequest({ request })).toThrow('autonomous_engineering_not_supported');
});

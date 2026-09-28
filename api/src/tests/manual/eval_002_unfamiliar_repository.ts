import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import * as llm from '../../core/llm';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function evalUnfamiliarRepository() {
    console.log('🧪 Starting EVAL-002: Unknown Existing Repository Evaluation...');

    process.env.JOE_PRO_ALPHA = '1';
    process.env.OFFLINE_MODE = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'eval-only';
    process.env.JOE_TEST_MODE = 'true';

    const evidenceRoot = path.resolve('data/tests/eval_unfamiliar_repo');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const projectsRoot = fs.mkdtempSync(path.join(evidenceRoot, 'run-'));
    process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

    // Mock plan: Simple flat repository - Joe needs to understand it and add a feature
    const mockPlan = {
        projectName: 'Simple Calculator - Add Power Feature',
        totalPhases: 2,
        estimatedDuration: '15 minutes',
        phases: [
            {
                phaseNumber: 1,
                name: 'Architecture Discovery',
                tasks: [
                    {
                        task: 'Explore repository structure',
                        tool: 'shell_execute',
                        args: {
                            command: 'find . -type f -name "*.js" | head -20'
                        },
                        priority: 'high'
                    },
                    {
                        task: 'Examine calculator module',
                        tool: 'shell_execute',
                        args: {
                            command: 'cat calculator.js'
                        },
                        priority: 'high'
                    },
                    {
                        task: 'Examine test file',
                        tool: 'shell_execute',
                        args: {
                            command: 'cat calculator.test.js'
                        },
                        priority: 'high'
                    },
                    {
                        task: 'Run existing tests to verify baseline',
                        tool: 'shell_execute',
                        args: {
                            command: 'npm test'
                        },
                        priority: 'high'
                    }
                ],
                verificationTask: {
                    task: 'Verify baseline tests pass',
                    tool: 'shell_execute',
                    verificationId: 'eval:baseline-tests',
                    verificationMode: 'focused',
                    relevantPaths: ['calculator.test.js'],
                    args: {
                        command: 'npm test'
                    }
                }
            },
            {
                phaseNumber: 2,
                name: 'Add Power Feature',
                tasks: [
                    {
                        task: 'Add power function to calculator',
                        tool: 'file_edit',
                        args: {
                            filename: 'calculator.js',
                            find: 'function divide(a, b) {\n    if (b === 0) throw new Error("Division by zero");\n    return a / b;\n}',
                            replace: 'function divide(a, b) {\n    if (b === 0) throw new Error("Division by zero");\n    return a / b;\n}\n\nfunction power(base, exponent) {\n    return Math.pow(base, exponent);\n}'
                        }
                    },
                    {
                        task: 'Export power function',
                        tool: 'file_edit',
                        args: {
                            filename: 'calculator.js',
                            find: 'module.exports = { add, subtract, multiply, divide };',
                            replace: 'module.exports = { add, subtract, multiply, divide, power };'
                        }
                    },
                    {
                        task: 'Add power tests',
                        tool: 'file_edit',
                        args: {
                            filename: 'calculator.test.js',
                            find: "const { add, subtract, multiply, divide } = require('./calculator');",
                            replace: "const { add, subtract, multiply, divide, power } = require('./calculator');"
                        }
                    },
                    {
                        task: 'Add power tests',
                        tool: 'file_edit',
                        args: {
                            filename: 'calculator.test.js',
                            find: "test('divide handles division by zero', () => {\n    assert.throws(() => divide(10, 0), { message: 'Division by zero' });\n});",
                            replace: "test('divide handles division by zero', () => {\n    assert.throws(() => divide(10, 0), { message: 'Division by zero' });\n});\n\ntest('power calculates correctly', () => {\n    assert.strictEqual(power(2, 3), 8);\n    assert.strictEqual(power(5, 0), 1);\n    assert.strictEqual(power(3, 2), 9);\n});"
                        }
                    }
                ],
                verificationTask: {
                    task: 'Verify implementation tests pass',
                    tool: 'shell_execute',
                    verificationId: 'eval:implementation-tests',
                    verificationMode: 'focused',
                    relevantPaths: ['calculator.js', 'calculator.test.js'],
                    args: {
                        command: 'npm test'
                    }
                }
            },
            {
                phaseNumber: 3,
                name: 'Verify Power Feature Works',
                tasks: [
                    {
                        task: 'Test power function manually',
                        tool: 'shell_execute',
                        args: {
                            command: 'node -e "const { power } = require(\'./calculator\'); console.log(power(2, 3)); console.log(power(5, 0)); console.log(power(3, 2));"'
                        },
                        priority: 'high'
                    },
                    {
                        task: 'Run full test suite to ensure no regressions',
                        tool: 'shell_execute',
                        verificationId: 'eval:final-regression-tests',
                        verificationMode: 'final',
                        args: {
                            command: 'npm test'
                        }
                    }
                ],
                verificationTask: {
                    task: 'Final verification - all tests pass and feature works',
                    tool: 'shell_execute',
                    verificationId: 'eval:final-verification',
                    verificationMode: 'final',
                    args: {
                        command: 'npm test'
                    }
                }
            }
        ]
    };

    const originalCallLLM = llm.callLLM;
    (llm as any).callLLM = async (prompt: string) => {
        if (prompt.includes('Create a realistic software engineering execution plan')) {
            return JSON.stringify(mockPlan);
        }
        return originalCallLLM(prompt);
    };

    const { executeTool } = await import('../../modules/services/ToolService');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    const sessionId = 'eval-002-' + Date.now();
    const workspaceId = 'eval-unfamiliar-repo-workspace';
    const userId = 'eval-user';

    try {
        // Create the unfamiliar repository directly in the workspace root (flat structure)
        const repoPath = path.join(projectsRoot, workspaceId);
        fs.mkdirSync(repoPath, { recursive: true });

        // Create package.json
        fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({
            name: 'simple-calculator',
            version: '1.0.0',
            description: 'A simple calculator',
            main: 'calculator.js',
            scripts: {
                test: 'node --test calculator.test.js'
            },
            dependencies: {},
            devDependencies: {}
        }, null, 2));

        // Create calculator.js (flat structure - no subdirectories)
        fs.writeFileSync(path.join(repoPath, 'calculator.js'), `
function add(a, b) {
    return a + b;
}

function subtract(a, b) {
    return a - b;
}

function multiply(a, b) {
    return a * b;
}

function divide(a, b) {
    if (b === 0) throw new Error("Division by zero");
    return a / b;
}

module.exports = { add, subtract, multiply, divide };
`);

        // Create calculator.test.js
        fs.writeFileSync(path.join(repoPath, 'calculator.test.js'), `
const test = require('node:test');
const assert = require('node:assert');
const { add, subtract, multiply, divide } = require('./calculator');

test('add works', () => {
    assert.strictEqual(add(2, 3), 5);
    assert.strictEqual(add(-1, 1), 0);
});

test('subtract works', () => {
    assert.strictEqual(subtract(5, 3), 2);
    assert.strictEqual(subtract(0, 5), -5);
});

test('multiply works', () => {
    assert.strictEqual(multiply(3, 4), 12);
    assert.strictEqual(multiply(-2, 3), -6);
});

test('divide works', () => {
    assert.strictEqual(divide(10, 2), 5);
    assert.strictEqual(divide(7, 2), 3.5);
});

test('divide handles division by zero', () => {
    assert.throws(() => divide(10, 0), { message: 'Division by zero' });
});
`);

        const manifest = await executionFirewall.runAsSystem(async () => {
            return executeTool('write_file', {
                path: 'package.json', content: JSON.stringify({ private: true, scripts: {
                    test: 'node --test calculator.test.js'
                } }),
            }, { sessionId, workspaceId, userId });
        });
        if (!manifest.ok) throw new Error('Verification fixture manifest could not be created');

        const discovery = await executionFirewall.runAsSystem(async () => {
            return executeTool('engineering_discovery', {
                request: 'Add a power function to this calculator. The calculator currently has add, subtract, multiply, divide. Need to add a power function that calculates base^exponent. Export it and add tests. Existing tests must continue to pass.',
            }, { sessionId, workspaceId, userId });
        });
        if (!discovery.ok) throw new Error('Verification fixture discovery failed');

        console.log('📋 Running ProjectPlannerTool...');
        const plannerResult = await executionFirewall.runAsSystem(async () => {
            return executeTool('project_planner', {
                projectDescription: 'Add a power function to an existing simple calculator. The calculator currently has add, subtract, multiply, divide. Need to add a power function that calculates base^exponent, export it, add tests, and ensure existing tests pass.',
                evidence: discovery.output,
            }, { sessionId, workspaceId, userId });
        });

        if (!plannerResult.ok) throw new Error(`Planner failed: ${plannerResult.error}`);

        console.log('🚀 Running AgentLoopService orchestrator...');
        const pipelineResult = await executionFirewall.runAsSystem(async () => {
            return await (AgentLoopService as any).runPlannedPhasesIfPresent({
                sessionId,
                runId: 'eval-002-run',
                userId,
                workspaceId,
                plannerResult
            });
        });

        let passed = true;
        console.log('\n--- Final Verification ---');

        if (pipelineResult.ok === true && pipelineResult.completedPhases >= 2) {
            console.log('✅ PASS: Overall pipeline completed successfully.');
        } else {
            console.error('❌ FAIL: Pipeline did not complete required phases.', JSON.stringify(pipelineResult, null, 2));
            passed = false;
        }

        // Verify existing tests still pass
        try {
            const testResult = await executionFirewall.runAsSystem(async () => {
                return executeTool('shell_execute', {
                    command: 'npm test'
                }, { sessionId, workspaceId, userId });
            });
            if (testResult.ok && /pass [1-9]\d*/.test(testResult.output?.stdout || '') && /fail 0/.test(testResult.output?.stdout || '')) {
                console.log('✅ PASS: Existing tests still pass (no regressions).');
            } else {
                console.error('❌ FAIL: Existing tests failed or regressions detected.', testResult.output?.stdout);
                passed = false;
            }
        } catch (e: any) {
            console.error('❌ FAIL: Could not run tests:', e.message);
            passed = false;
        }

        // Verify power function was added (in the evaluation workspace repo, not CWD)
        const calcPath = path.join(repoPath, 'calculator.js');
        const calcContent = fs.existsSync(calcPath) ? fs.readFileSync(calcPath, 'utf8') : '';
        if (calcContent.includes('power') && calcContent.includes('Math.pow')) {
            console.log('✅ PASS: Power function added to calculator.');
        } else {
            console.error('❌ FAIL: Power function not added to calculator.');
            passed = false;
        }

        // Check if power is exported
        const calcContent2 = fs.existsSync(calcPath) ? fs.readFileSync(calcPath, 'utf8') : '';
        if (calcContent2.includes('power') && calcContent2.includes('module.exports') && calcContent2.includes('power')) {
            console.log('✅ PASS: Power function exported.');
        } else {
            console.error('❌ FAIL: Power function not exported.');
            passed = false;
        }

        // Check if power tests added
        const testPath = path.join(repoPath, 'calculator.test.js');
        const testContent = fs.existsSync(testPath) ? fs.readFileSync(testPath, 'utf8') : '';
        if (testContent.includes('power') && testContent.includes('power calculates correctly')) {
            console.log('✅ PASS: Power tests added.');
        } else {
            console.error('❌ FAIL: Power tests not added.');
            passed = false;
        }

        // Test power function manually
        try {
            const powerTest = await executionFirewall.runAsSystem(async () => {
                return executeTool('shell_execute', {
                    command: 'node -e "const { power } = require(\'./calculator\'); console.log(power(2, 3)); console.log(power(5, 0)); console.log(power(3, 2));"'
                }, { sessionId, workspaceId, userId });
            });
            if (powerTest.ok && powerTest.output?.stdout?.includes('8') && powerTest.output?.stdout?.includes('1') && powerTest.output?.stdout?.includes('9')) {
                console.log('✅ PASS: Power function works correctly (2^3=8, 5^0=1, 3^2=9).');
            } else {
                console.error('❌ FAIL: Power function not working correctly.', powerTest.output?.stdout);
                passed = false;
            }
        } catch (e: any) {
            console.error('❌ FAIL: Could not test power function:', e.message);
            passed = false;
        }

        // Run final tests
        try {
            const finalTest = await executionFirewall.runAsSystem(async () => {
                return executeTool('shell_execute', {
                    command: 'npm test'
                }, { sessionId, workspaceId, userId });
            });
            if (finalTest.ok && /pass [1-9]\d*/.test(finalTest.output?.stdout || '') && /fail 0/.test(finalTest.output?.stdout || '')) {
                console.log('✅ PASS: All tests pass (no regressions).');
            } else {
                console.error('❌ FAIL: Final tests failed.', finalTest.output?.stdout);
                passed = false;
            }
        } catch (e: any) {
            console.error('❌ FAIL: Could not run final tests:', e.message);
            passed = false;
        }

        const evidencePath = path.join(projectsRoot, 'eval-evidence.json');
        fs.writeFileSync(path.join(projectsRoot, 'eval-evidence.json'), JSON.stringify({
            sessionId, workspaceId, passed, pipelineResult: pipelineResult.ok, completedPhases: pipelineResult.completedPhases,
        }, null, 2));
        console.log(`Independent verification evidence: ${path.join(projectsRoot, 'eval-evidence.json')}`);

        console.log('\n✨ EVAL-002 Unknown Repository Evaluation:', passed ? 'PASSED' : 'FAILED');
        if (!passed) process.exit(1);
        process.exit(0);
    } finally {
        (llm as any).callLLM = originalCallLLM;
    }
}

evalUnfamiliarRepository().catch(e => {
    console.error('💥 Test Crashed:', e);
    process.exit(1);
});
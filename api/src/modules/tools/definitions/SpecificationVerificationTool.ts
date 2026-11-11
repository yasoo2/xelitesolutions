import { ToolDefinition, ToolPermission } from '../types';
import { executeTool } from '../../services/ToolService';
import { workspaceService } from '../../services/WorkspaceService';
import { longTermMemory } from '../../../core/memory/long-term-memory';
import { StructuredSpecification, Requirement, AcceptanceCriterion, SpecificationVerificationResult, RequirementVerificationResult } from '../../../core/intelligence/specification';
import { judgeTestRun } from '../../../core/quality/test-run-evidence';
import fs from 'fs';
import path from 'path';

interface SpecificationVerificationInput {
    specificationId: string;
    projectRoot: string;
    userId: string;
}

interface SpecificationVerificationOutput {
    verified: boolean;
    specificationId: string;
    requirements: RequirementVerificationResult[];
    coverage: number;
    missingRequirements: string[];
}

export class SpecificationVerificationTool implements ToolDefinition {
    name = 'specification_verification';
    version = '1.0.0';
    description = 'Verify that all requirements from a structured specification are satisfied in the built project. Checks implementation existence, acceptance criteria, and test coverage for each requirement.';
    tags = ['verification', 'specification', 'quality', 'requirements'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            specificationId: { type: 'string' as const, description: 'The ID of the specification to verify' },
            projectRoot: { type: 'string' as const, description: 'The root directory of the built project' },
            userId: { type: 'string' as const, description: 'The user ID for memory lookup' },
        },
        required: ['specificationId', 'projectRoot', 'userId'],
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            verified: { type: 'boolean' as const },
            specificationId: { type: 'string' as const },
            requirements: {
                type: 'array' as const,
                items: {
                    type: 'object' as const,
                    properties: {
                        requirementId: { type: 'string' as const },
                        pass: { type: 'boolean' as const },
                        implementedIn: { type: 'array' as const, items: { type: 'string' } },
                        verifiedBy: { type: 'array' as const, items: { type: 'string' } },
                        evidence: { type: 'string' as const },
                        failedCriteria: { type: 'array' as const, items: { type: 'string' } },
                    },
                },
            },
            coverage: { type: 'number' as const },
            missingRequirements: { type: 'array' as const, items: { type: 'string' } },
        },
    };

    permissions: ToolPermission[] = ['read', 'execute'];
    sideEffects: ToolPermission[] = ['read', 'execute'];
    rateLimitPerMinute = 5;
    auditFields = ['specificationId', 'projectRoot'];
    mockSupported = false;

    async execute(input: SpecificationVerificationInput, context?: any): Promise<{ ok: boolean; output?: SpecificationVerificationOutput; error?: string; logs?: string[] }> {
        const logs: string[] = [];
        const { specificationId, projectRoot, userId } = input;

        const appendLog = (msg: string) => {
            logs.push(`[spec_verification] ${msg}`);
            context?.onProgress?.(msg);
        };

        appendLog(`Starting specification verification for ${specificationId}`);

        try {
            // Load the specification from memory
            const specMemory = await longTermMemory.getSpecification(specificationId);
            if (!specMemory) {
                return {
                    ok: false,
                    error: `Specification ${specificationId} not found in memory`,
                    logs,
                };
            }

            const spec: StructuredSpecification = {
                specificationId: specMemory.specificationId,
                sourceText: specMemory.sourceText,
                requirements: specMemory.requirements,
                constraints: specMemory.constraints,
                implicitRequirements: specMemory.implicitRequirements,
                acceptanceCriteria: specMemory.acceptanceCriteria,
                constraintInteractions: specMemory.constraintInteractions,
                metadata: {
                    extractedAt: specMemory.metadata?.createdAt || Date.now(),
                    extractorVersion: '1.0.0',
                    confidence: 1.0,
                },
            };

            appendLog(`Loaded specification ${spec.specificationId} with ${spec.requirements.length} requirements, ${spec.acceptanceCriteria.length} acceptance criteria`);

            const projectRootAbs = path.resolve(projectRoot);
            if (!fs.existsSync(projectRootAbs)) {
                return {
                    ok: false,
                    error: `Project root does not exist: ${projectRootAbs}`,
                    logs,
                };
            }

            const results: RequirementVerificationResult[] = [];
            let passCount = 0;

            for (const req of spec.requirements) {
                appendLog(`Verifying requirement ${req.id}: ${req.description.substring(0, 80)}...`);
                
                const result = await this.verifyRequirement(req, spec, projectRootAbs, appendLog, context);
                results.push(result);
                
                if (result.pass) {
                    passCount++;
                    appendLog(`  ✅ PASS: ${req.id}`);
                } else {
                    appendLog(`  ❌ FAIL: ${req.id} - ${result.evidence}`);
                }
            }

            const coverage = spec.requirements.length > 0 ? passCount / spec.requirements.length : 1;
            const missingRequirements = results.filter(r => !r.pass).map(r => r.requirementId);
            const verified = missingRequirements.length === 0;

            appendLog(`Verification complete: ${passCount}/${spec.requirements.length} requirements passed (${Math.round(coverage * 100)}% coverage)`);

            const output: SpecificationVerificationOutput = {
                verified,
                specificationId,
                requirements: results,
                coverage,
                missingRequirements,
            };

            return { ok: true, output, logs };
        } catch (error: any) {
            const errorMsg = String(error?.message || error);
            appendLog(`Verification error: ${errorMsg}`);
            return {
                ok: false,
                error: `Specification verification failed: ${errorMsg}`,
                logs,
            };
        }
    }

    private async verifyRequirement(
        req: Requirement,
        spec: StructuredSpecification,
        projectRoot: string,
        log: (msg: string) => void,
        context?: any
    ): Promise<RequirementVerificationResult> {
        const implementedIn: string[] = [];
        const verifiedBy: string[] = [];
        const failedCriteria: string[] = [];
        let evidence = '';

        // 1. Find implementation files for this requirement
        const implFiles = await this.findImplementationFiles(req, spec, projectRoot);
        implementedIn.push(...implFiles);
        
        if (implFiles.length === 0) {
            return {
                requirementId: req.id,
                pass: false,
                implementedIn: [],
                verifiedBy: [],
                evidence: `No implementation files found for requirement: ${req.description}`,
                failedCriteria: ['No implementation found'],
            };
        }

        // 2. Check acceptance criteria
        for (const acId of req.acceptanceCriteria) {
            const ac = spec.acceptanceCriteria.find(ac => ac.id === acId);
            if (!ac) continue;

            const criterionResult = await this.verifyAcceptanceCriterion(ac, req, projectRoot);
            if (!criterionResult.pass) {
                failedCriteria.push(`${acId}: ${criterionResult.evidence}`);
            } else {
                verifiedBy.push(acId);
            }
        }

        // 3. Run associated tests if any
        const testFiles = this.findTestFiles(req, projectRoot);
        if (testFiles.length > 0) {
            const testResult = await this.runTests(testFiles, projectRoot, context);
            if (!testResult.pass) {
                failedCriteria.push(`Tests failed: ${testResult.evidence}`);
            } else {
                verifiedBy.push(...testFiles);
            }
        }

        const pass = failedCriteria.length === 0 && implFiles.length > 0;
        evidence = pass 
            ? `Requirement implemented in ${implFiles.join(', ')} and all acceptance criteria verified`
            : `Failed: ${failedCriteria.join('; ')}`;

        return {
            requirementId: req.id,
            pass,
            implementedIn,
            verifiedBy,
            evidence,
            failedCriteria,
        };
    }

    private async findImplementationFiles(req: Requirement, spec: StructuredSpecification, projectRoot: string): Promise<string[]> {
        const files: string[] = [];
        const reqKeywords = this.extractKeywords(req.description);
        
        // Walk the project directory to find relevant files
        const sourceRoot = fs.existsSync(path.join(projectRoot, 'src')) 
            ? path.join(projectRoot, 'src') 
            : projectRoot;

        const walk = (dir: string) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walk(fullPath);
                    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx'))) {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const relPath = path.relative(projectRoot, fullPath);
                        if (this.contentMatchesRequirement(content, reqKeywords)) {
                            files.push(relPath);
                        }
                    }
                }
            } catch { /* ignore */ }
        };

        walk(sourceRoot);
        return [...new Set(files)]; // deduplicate
    }

    private extractKeywords(description: string): string[] {
        // Extract meaningful keywords from requirement description
        const words = description.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3)
            .filter(w => !['that', 'this', 'with', 'from', 'have', 'will', 'should', 'must', 'need', 'require', 'shall', 'implement', 'create', 'build', 'make', 'add', 'the', 'and', 'for', 'are', 'you', 'all', 'but', 'not', 'has', 'can', 'was', 'were', 'been', 'being', 'more', 'most', 'less', 'very', 'only', 'also', 'even', 'just', 'like', 'into', 'over', 'under', 'after', 'before', 'between', 'through', 'during', 'without', 'against', 'among', 'toward', 'within', 'across', 'around', 'behind', 'beyond', 'inside', 'outside', 'above', 'below', 'upon', 'near', 'far', 'high', 'low', 'big', 'small', 'large', 'tiny', 'huge', 'great', 'good', 'bad', 'new', 'old', 'same', 'different', 'each', 'every', 'any', 'some', 'many', 'few', 'several', 'various', 'certain', 'specific', 'particular', 'general', 'common', 'typical', 'standard', 'normal', 'regular', 'usual', 'common', 'usual', 'typical', 'standard', 'normal', 'regular'].includes(w));
        return [...new Set(words)].slice(0, 10); // limit keywords
    }

    private contentMatchesRequirement(content: string, keywords: string[]): boolean {
        if (keywords.length === 0) return false;
        const lowerContent = content.toLowerCase();
        // At least 30% of keywords must match
        const matches = keywords.filter(k => lowerContent.includes(k.toLowerCase())).length;
        return matches >= Math.ceil(keywords.length * 0.3);
    }

    private findTestFiles(req: Requirement, projectRoot: string): string[] {
        const testFiles: string[] = [];
        const testRoots = [
            path.join(projectRoot, 'test'),
            path.join(projectRoot, 'tests'),
            path.join(projectRoot, '__tests__'),
            path.join(projectRoot, 'spec'),
            path.join(projectRoot, '__spec__'),
        ];

        for (const testRoot of testRoots) {
            if (!fs.existsSync(testRoot)) continue;
            try {
                const walk = (dir: string) => {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            walk(fullPath);
                        } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.js') || entry.name.endsWith('.spec.js'))) {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            const reqKeywords = this.extractKeywords(req.description);
                            if (this.contentMatchesRequirement(content, reqKeywords)) {
                                testFiles.push(path.relative(projectRoot, fullPath));
                            }
                        }
                    }
                };
                walk(testRoot);
            } catch { /* ignore */ }
        }
        return [...new Set(testFiles)];
    }

private async runTests(testFiles: string[], projectRoot: string, context?: any): Promise<{ pass: boolean; evidence: string }> {
        try {
            // Validate project root against workspace containment
            const activeRoot = workspaceService.getActiveRoot();
            const projectRootAbs = path.resolve(projectRoot);
            if (!projectRootAbs.startsWith(activeRoot)) {
                return { pass: false, evidence: `Project root outside workspace: ${projectRootAbs}` };
            }

            const result = await executeTool('shell_execute', {
                command: 'npm test',
                cwd: projectRootAbs,
                timeout: 120000,
            }, context);
            // Exit 0 with «ℹ tests 0» proved no criterion: the one test-run
            // judge reads the runner's own summary (round 21 review, Q1).
            const output: any = (result as any).output && typeof (result as any).output === 'object' ? (result as any).output : { stdout: String((result as any).output ?? '') };
            const judged = judgeTestRun(result.ok === true, `${String(output.stdout ?? '')}\n${String(output.stderr ?? '')}`);
            if (judged.ranNothing) return { pass: false, evidence: `Tests did not run: ${judged.reason}` };
            return { pass: judged.passed, evidence: judged.passed ? 'Tests passed' : `Tests failed: ${result.error || output.stderr || output.stdout || 'Unknown error'}` };
        } catch (error: any) {
            return { pass: false, evidence: `Tests failed: ${error.message || String(error)}` };
        }
    }

    private async verifyAcceptanceCriterion(ac: AcceptanceCriterion, req: Requirement, projectRoot: string): Promise<{ pass: boolean; evidence: string }> {
        // For now, check if there are test files that cover this criterion
        // In a more advanced implementation, this would parse the criterion and verify it directly
        const testFiles = this.findTestFiles(req, projectRoot);
        
        if (testFiles.length === 0) {
            return { 
                pass: false, 
                evidence: `No test files found for acceptance criterion ${ac.id}: ${ac.description}` 
            };
        }

        // Run tests to verify
        const testResult = await this.runTests(testFiles, projectRoot);
        return {
            pass: testResult.pass,
            evidence: testResult.pass 
                ? `Acceptance criterion ${ac.id} verified by tests` 
                : `Acceptance criterion ${ac.id} failed: ${testResult.evidence}`
        };
    }
}
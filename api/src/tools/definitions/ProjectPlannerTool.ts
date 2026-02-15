import { ToolDefinition } from '../types';
import { callLLM } from '../../llm';

/**
 * ProjectPlannerTool - Breaks down complex projects into manageable phases
 * Uses LLM to create a hierarchical execution plan
 */
export class ProjectPlannerTool implements ToolDefinition {
    name = 'project_planner';
    version = '1.0.0';
    description = 'Break down complex projects into phases and tasks for systematic execution';
    tags = ['planning', 'project', 'llm'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            projectDescription: {
                type: 'string' as const,
                description: 'Description of the project to plan'
            },
            analysis: {
                type: 'object' as const,
                description: 'Optional analysis from RequestAnalyzer',
                properties: {
                    projectType: { type: 'string' as const },
                    complexity: { type: 'string' as const },
                    modules: {
                        type: 'array' as const,
                        items: { type: 'string' as const }
                    },
                    estimatedFiles: { type: 'number' as const }
                }
            }
        },
        required: ['projectDescription']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            projectName: { type: 'string' as const },
            totalPhases: { type: 'number' as const },
            estimatedDuration: { type: 'string' as const },
            phases: {
                type: 'array' as const,
                items: { type: 'object' as const }
            }
        }
    };

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 5;
    auditFields = ['projectDescription'];
    mockSupported = false;

    async execute(input: { projectDescription: string; analysis?: any }) {
        const { projectDescription, analysis } = input;
        const logs: string[] = [];

        try {
            logs.push(`Planning project: "${projectDescription.slice(0, 100)}..."`);

            // Construct planning prompt
            const planningPrompt = `You are an expert project manager and software architect. Create a detailed execution plan for the following project.

PROJECT DESCRIPTION:
${projectDescription}

${analysis ? `
ANALYSIS DATA:
- Project Type: ${analysis.projectType}
- Complexity: ${analysis.complexity}
- Modules: ${analysis.modules?.join(', ')}
- Estimated Files: ${analysis.estimatedFiles}
` : ''}

Create a hierarchical plan with 3-5 phases. Each phase should be completable independently.

QUALITY INSTRUCTIONS:
- For "Creative", "Landing Page", or "Website" requests, prioritize MODERN AESTHETICS (glassmorphism, vibrant gradients, rich typography).
- CRITICAL: USE THE "ai_write_file" TOOL FOR ALL CODE GENERATION. This tool uses AI to write full, rich files.
- Do NOT use "scaffold_project" or "write_file" for the main logic; use "ai_write_file" so the implementation is NOT a placeholder.
- Ensure the project structure is clean and follows industry best practices (3-Tier architecture for fullstack, organized assets for static).
- The FINAL phase MUST be "Launch & Preview" which includes the dev_server_start tool.

Return ONLY valid JSON in this format:
{
  "projectName": "Short project name",
  "totalPhases": 4,
  "estimatedDuration": "2-3 hours",
  "phases": [
    {
      "phaseNumber": 1,
      "name": "Phase Name",
      "description": "What this phase accomplishes",
      "tasks": [
        {
          "task": "Develop the main landing page structure with rich CSS",
          "tool": "ai_write_file",
          "args": {
             "path": "web-app/index.html",
             "description": "Full HTML5 landing page with glassmorphism, responsive sections, and Arabic support. Style with an external CSS file."
          },
          "priority": "high"
        }
      ],
      "deliverables": ["file1.js", "file2.ts"],
      "estimatedTime": "30 minutes"
    }
  ],
  "dependencies": {
    "phase2": ["phase1"],
    "phase3": ["phase1", "phase2"]
  }
}

IMPORTANT: Return ONLY valid JSON, no markdown, no explanations. Use "ai_write_file" with "path" and "description" args for all files.`;

            // Call LLM for planning
            const llmContext = [
                { role: 'system', content: 'You are a project manager that returns only valid JSON.' }
            ];

            const response = await callLLM(planningPrompt, llmContext);

            logs.push(`LLM planning completed`);

            // Parse LLM response
            let plan;
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : response;
                plan = JSON.parse(jsonStr);
            } catch (parseError) {
                logs.push(`JSON parse error: ${parseError}`);
                // Fallback to basic plan
                plan = this.fallbackPlan(projectDescription, analysis);
            }

            // Validate and enrich plan
            plan = this.validatePlan(plan, projectDescription);

            logs.push(`Plan created: ${plan.totalPhases} phases, ${plan.estimatedDuration}`);

            return {
                ok: true,
                output: plan,
                logs
            };

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                output: this.fallbackPlan(projectDescription, analysis),
                logs
            };
        }
    }

    /**
     * Fallback plan when LLM fails
     */
    private fallbackPlan(projectDescription: string, analysis?: any): any {
        const projectName = projectDescription.split(' ').slice(0, 3).join(' ');
        const complexity = analysis?.complexity || 'medium';
        const phaseCount = complexity === 'simple' ? 3 : complexity === 'complex' ? 5 : 4;

        return {
            projectName,
            totalPhases: phaseCount,
            estimatedDuration: `${phaseCount * 30} minutes`,
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Project Setup',
                    description: 'Initialize project structure and dependencies',
                    tasks: [
                        { task: 'Create project directory', tool: 'scaffold_project', priority: 'high' },
                        { task: 'Install dependencies', tool: 'npm_manager', priority: 'high' }
                    ],
                    deliverables: ['package.json', 'README.md'],
                    estimatedTime: '15 minutes'
                },
                {
                    phaseNumber: 2,
                    name: 'Core Implementation',
                    description: 'Build main features',
                    tasks: [
                        { task: 'Create main files', tool: 'file_edit', priority: 'high' }
                    ],
                    deliverables: ['src/index.js'],
                    estimatedTime: '45 minutes'
                },
                {
                    phaseNumber: 3,
                    name: 'Testing & Verification',
                    description: 'Test and verify functionality',
                    tasks: [
                        { task: 'Run tests', tool: 'shell_execute', priority: 'medium' }
                    ],
                    deliverables: ['tests/'],
                    estimatedTime: '20 minutes'
                },
                {
                    phaseNumber: 4,
                    name: 'Launch & Preview',
                    description: 'Start the development server and preview the project',
                    tasks: [
                        { task: 'Start dev server', tool: 'dev_server_start', priority: 'high' }
                    ],
                    deliverables: ['Live Preview'],
                    estimatedTime: '5 minutes'
                }
            ],
            dependencies: {
                'phase2': ['phase1'],
                'phase3': ['phase2']
            },
            fallback: true
        };
    }

    /**
     * Validate and ensure plan has required fields
     */
    private validatePlan(plan: any, projectDescription: string): any {
        return {
            projectName: plan.projectName || 'New Project',
            totalPhases: typeof plan.totalPhases === 'number' ? plan.totalPhases : 3,
            estimatedDuration: plan.estimatedDuration || '1-2 hours',
            phases: Array.isArray(plan.phases) ? plan.phases : [],
            dependencies: plan.dependencies || {},
            originalDescription: projectDescription.slice(0, 200)
        };
    }
}

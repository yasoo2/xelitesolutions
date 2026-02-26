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

            // Construct planning prompt
            const planningPrompt = `You are a Senior Project Manager and Lead Software Architect. Create a COMPREHENSIVE and REALISTIC execution plan for the following project.

PROJECT DESCRIPTION:
${projectDescription}

${analysis ? `
ANALYSIS DATA:
- Project Type: ${analysis.projectType}
- Complexity: ${analysis.complexity}
- Modules: ${analysis.modules?.join(', ')}
- Estimated Files: ${analysis.estimatedFiles}
` : ''}

Create a hierarchical plan with 3-6 distinct phases. Each phase must have a professional name and a detailed description that communicates the "vibe" and objectives.

QUALITY & ARCHITECTURE INSTRUCTIONS:
1. **Premium Aesthetics**: For all web/UI tasks, mandate "Premium Aesthetics" (glassmorphism, vibrant gradients, high-end typography, smooth micro-animations). 
2. **Realistic Estimations**: Do NOT use generic times. Estimate based on realistic engineering effort (e.g., "45-60 mins" for complex UI, "15 mins" for setup). Total duration must align with phase sums.
3. **Core Tooling**: CRITICAL - Use "ai_write_file" for all primary code generation. This ensures the implementation is full-featured and NOT a placeholder.
4. **Project Structure**: Enforce a professional file structure (e.g., separate assets, components, services).
5. **RTL Support**: If the project description is in Arabic, all task descriptions and implemented UI MUST support RTL (dir="rtl").
6. **Final Phase**: Must be "Launch & Production Readiness" including "dev_server_start".

Return ONLY valid JSON in this format:
{
  "projectName": "Professional Project Name",
  "projectVibe": "e.g., Luxury Corporate, Neon Cyberpunk, Minimalist Glass",
  "totalPhases": 4,
  "estimatedDuration": "3-4 hours of focused engineering",
  "phases": [
    {
      "phaseNumber": 1,
      "name": "🚀 Phase Name with Emoji",
      "description": "Professional summary of the phase's aesthetic and technical goals",
      "tasks": [
        {
          "task": "Detailed task description",
          "tool": "ai_write_file",
          "args": {
             "path": "path/to/file",
             "description": "Extremely detailed prompt for the AI writer to ensure a premium result."
          },
          "priority": "high",
          "realisticMinutes": 30
        }
      ],
      "deliverables": ["List of key files or outcomes"],
      "estimatedTime": "Time string"
    }
  ],
  "dependencies": {
    "phase2": ["phase1"]
  }
}

IMPORTANT: Return ONLY valid JSON. No conversational filler. Use "ai_write_file" for all implementation tasks. Ensure the plan feels "Real" to a professional developer.`;

            // Call LLM for planning
            const llmContext = [
                { role: 'system', content: 'You are a project manager that returns only valid JSON.' }
            ];

            const response = await callLLM(planningPrompt, llmContext);

            logs.push(`LLM planning completed`);

            let plan;
            try {
                // 1. First, try to extract specifically from markdown JSON blocks
                const markdownMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                let jsonStr = markdownMatch ? markdownMatch[1] : response;

                // 2. Next, try to find the outermost JSON braces if still failing
                if (!markdownMatch) {
                    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
                    if (braceMatch) jsonStr = braceMatch[0];
                }

                // 3. Clean up common JSON errors caused by small models
                jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas
                jsonStr = jsonStr.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m); // Try strip comments

                plan = JSON.parse(jsonStr);

                // Basic validation
                if (!plan.phases || !Array.isArray(plan.phases)) {
                    throw new Error("Missing phases array in JSON");
                }
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
        const safeDirName = projectName.replace(/[^a-zA-Z0-9-_\u0600-\u06FF]/g, '-').replace(/-+/g, '-').slice(0, 30) || 'new-project';
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
                        {
                            task: 'Create project directory and base files',
                            tool: 'scaffold_project',
                            args: {
                                baseDir: safeDirName,
                                structure: {
                                    'package.json': JSON.stringify({
                                        name: safeDirName,
                                        version: '1.0.0',
                                        private: true,
                                        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
                                        devDependencies: { vite: '^5.0.0' }
                                    }, null, 2),
                                    'vite.config.js': `import { defineConfig } from 'vite';\nexport default defineConfig({\n  server: { host: '0.0.0.0', port: 5180, allowedHosts: true }\n});`,
                                    'src': null,
                                    'public': null,
                                    'README.md': `# ${projectName}\n\n${projectDescription}`
                                }
                            },
                            priority: 'high'
                        },
                        {
                            task: 'Install dependencies',
                            tool: 'npm_manager',
                            args: { command: 'install' },
                            priority: 'medium'
                        }
                    ],
                    deliverables: ['package.json', 'vite.config.js', 'README.md'],
                    estimatedTime: '15 minutes'
                },
                {
                    phaseNumber: 2,
                    name: 'Core Implementation',
                    description: 'Build main landing page with modern design',
                    tasks: [
                        {
                            task: 'Create main HTML landing page',
                            tool: 'ai_write_file',
                            args: {
                                path: `${safeDirName}/index.html`,
                                description: `Create an ultra-high-quality, modern HTML5 web application exactly matching this core requirement: "${projectDescription}". 
                                
CRITICAL RULES:
- Read the requirement carefully! If the user wants a store, build a store UI. If they want a blog, build a blog.
- DO NOT just build a generic landing page with a hero and footer, unless they asked for it.
- Use glassmorphism, vibrant gradients, responsive design. 
- Ensure Arabic RTL layout (dir="rtl") if the prompt is in Arabic.
- Provide FULL, production-ready code. No <!-- placeholders -->.`
                            },
                            priority: 'high'
                        },
                        {
                            task: 'Create CSS styles',
                            tool: 'ai_write_file',
                            args: {
                                path: `${safeDirName}/src/style.css`,
                                description: `Create a comprehensive CSS stylesheet tailored explicitly for: "${projectDescription}".
                                
CRITICAL RULES:
- Design it based on the exact nature of the requested project.
- Include: CSS reset, premium typography, custom properties, responsive grid, glassmorphism cards, nested multi-layer shadows, gradient backgrounds.
- Add smooth animations and hover micro-interactions.
- Must support mobile-first media queries and Arabic RTL alignment.`
                            },
                            priority: 'high'
                        }
                    ],
                    deliverables: ['index.html', 'src/style.css'],
                    estimatedTime: '45 minutes'
                },
                {
                    phaseNumber: 3,
                    name: 'Enhancement & Assets',
                    description: 'Add interactivity and polish',
                    tasks: [
                        {
                            task: 'Create JavaScript for interactivity',
                            tool: 'ai_write_file',
                            args: {
                                path: `${safeDirName}/src/main.js`,
                                description: `Create a JavaScript file for the "${projectDescription}" landing page. Include: smooth scroll, mobile navigation toggle, scroll animations (intersection observer), dynamic counters, form validation if applicable.`
                            },
                            priority: 'medium'
                        }
                    ],
                    deliverables: ['src/main.js'],
                    estimatedTime: '20 minutes'
                },
                {
                    phaseNumber: 4,
                    name: 'Launch & Preview',
                    description: 'Start the development server and preview the project',
                    tasks: [
                        { task: 'Start dev server', tool: 'dev_server_start', args: { directory: safeDirName }, priority: 'high' }
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
            projectVibe: plan.projectVibe || 'Professional Engineering',
            totalPhases: typeof plan.totalPhases === 'number' ? plan.totalPhases : 3,
            estimatedDuration: plan.estimatedDuration || '1-2 hours',
            phases: Array.isArray(plan.phases) ? plan.phases : [],
            dependencies: plan.dependencies || {},
            originalDescription: projectDescription.slice(0, 200)
        };
    }
}

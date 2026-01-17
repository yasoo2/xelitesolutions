import { ToolDefinition } from '../types';
import { callLLM } from '../../llm';

/**
 * RequestAnalyzerTool - Advanced request analysis using LLM
 * Analyzes complex build requests to extract requirements, modules, and complexity
 */
export class RequestAnalyzerTool implements ToolDefinition {
    name = 'request_analyzer';
    version = '1.0.0';
    description = 'Analyze complex build requests to extract requirements, modules, and estimate complexity';
    tags = ['analysis', 'planning', 'llm'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            userRequest: {
                type: 'string' as const,
                description: 'The user\'s build request to analyze'
            },
            context: {
                type: 'object' as const,
                description: 'Optional context (session info, previous messages, etc.)',
                properties: {
                    sessionId: { type: 'string' as const },
                    previousMessages: {
                        type: 'array' as const,
                        items: { type: 'object' as const },
                        description: 'Previous conversation messages'
                    }
                }
            }
        },
        required: ['userRequest']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            projectType: { type: 'string' as const },
            complexity: { type: 'string' as const },
            modules: { type: 'array' as const },
            estimatedFiles: { type: 'number' as const },
            techStack: { type: 'object' as const },
            requirements: { type: 'array' as const }
        }
    };

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 10; // Limit LLM calls
    auditFields = ['userRequest'];
    mockSupported = false;

    async execute(input: { userRequest: string; context?: any }) {
        const { userRequest, context } = input;
        const logs: string[] = [];

        try {
            logs.push(`Analyzing request: "${userRequest.slice(0, 100)}..."`);

            // Construct analysis prompt
            const analysisPrompt = `You are an expert software architect. Analyze the following build request and provide a structured analysis.

USER REQUEST:
${userRequest}

Provide your analysis in the following JSON format:
{
  "projectType": "fullstack|api|website|dashboard|cms|ecommerce|mobile|other",
  "complexity": "simple|medium|complex|very_complex",
  "estimatedFiles": <number>,
  "modules": ["module1", "module2", ...],
  "techStack": {
    "frontend": "react|vue|angular|html|none",
    "backend": "node|python|java|none",
    "database": "mongodb|postgresql|mysql|none",
    "other": ["tool1", "tool2"]
  },
  "requirements": [
    {
      "category": "functional|technical|design",
      "description": "requirement description",
      "priority": "high|medium|low"
    }
  ],
  "phases": [
    {
      "name": "Phase name",
      "tasks": ["task1", "task2"],
      "estimatedTime": "X minutes"
    }
  ]
}

IMPORTANT: Return ONLY valid JSON, no markdown, no explanations.`;

            // Call LLM for analysis using correct signature
            const llmContext = [
                { role: 'system', content: 'You are a software architect that returns only valid JSON.' }
            ];

            const response = await callLLM(analysisPrompt, llmContext);

            logs.push(`LLM analysis completed`);

            // Parse LLM response
            let analysis;
            try {
                // Extract JSON from response (in case LLM adds markdown)
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : response;
                analysis = JSON.parse(jsonStr);
            } catch (parseError) {
                logs.push(`JSON parse error: ${parseError}`);
                // Fallback to basic analysis
                analysis = this.fallbackAnalysis(userRequest);
            }

            // Validate and enrich analysis
            analysis = this.validateAnalysis(analysis, userRequest);

            logs.push(`Analysis complete: ${analysis.projectType}, ${analysis.complexity}, ${analysis.modules.length} modules`);

            return {
                ok: true,
                output: analysis,
                logs
            };

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                output: this.fallbackAnalysis(userRequest),
                logs
            };
        }
    }

    /**
     * Fallback analysis when LLM fails
     */
    private fallbackAnalysis(userRequest: string): any {
        const text = userRequest.toLowerCase();

        // Simple keyword-based detection
        const hasAuth = /auth|login|register|signup/i.test(text);
        const hasDatabase = /database|mongodb|postgres|sql|data/i.test(text);
        const hasUI = /ui|interface|dashboard|page|component/i.test(text);
        const hasAPI = /api|endpoint|rest|graphql/i.test(text);

        const modules: string[] = [];
        if (hasAuth) modules.push('authentication');
        if (hasDatabase) modules.push('database');
        if (hasUI) modules.push('ui');
        if (hasAPI) modules.push('api');

        // Estimate complexity based on keywords
        const complexityScore = modules.length +
            (text.split('module').length - 1) +
            (text.split('feature').length - 1);

        const complexity = complexityScore < 3 ? 'simple' :
            complexityScore < 6 ? 'medium' :
                complexityScore < 10 ? 'complex' : 'very_complex';

        return {
            projectType: hasUI && hasAPI ? 'fullstack' : hasAPI ? 'api' : 'website',
            complexity,
            modules,
            estimatedFiles: modules.length * 5,
            techStack: {
                frontend: hasUI ? 'react' : 'none',
                backend: hasAPI ? 'node' : 'none',
                database: hasDatabase ? 'mongodb' : 'none',
                other: []
            },
            requirements: [],
            phases: [],
            fallback: true
        };
    }

    /**
     * Validate and ensure analysis has required fields
     */
    private validateAnalysis(analysis: any, userRequest: string): any {
        return {
            projectType: analysis.projectType || 'other',
            complexity: analysis.complexity || 'medium',
            modules: Array.isArray(analysis.modules) ? analysis.modules : [],
            estimatedFiles: typeof analysis.estimatedFiles === 'number' ? analysis.estimatedFiles : 10,
            techStack: analysis.techStack || { frontend: 'none', backend: 'none', database: 'none', other: [] },
            requirements: Array.isArray(analysis.requirements) ? analysis.requirements : [],
            phases: Array.isArray(analysis.phases) ? analysis.phases : [],
            originalRequest: userRequest.slice(0, 200)
        };
    }
}

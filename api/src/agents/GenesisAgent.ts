import { pollinationsProvider } from '../llm/providers/registry';
import { ArchitectAgent } from './ArchitectAgent';
import { analyzeTask } from '../llm/intelligent-router';
import { freeIntelligenceOptimizer } from '../llm/free-intelligence-optimizer';

interface TaskStep {
    name: string;
    tool: string;
    args: any;
}

/**
 * GenesisAgent V2.0 - With Fallback Providers & Default Scaffolding
 * 
 * Key Improvements:
 * 1. Falls back to Gemini if Pollinations fails
 * 2. Generates default scaffold steps if all LLMs fail
 * 3. Better JSON extraction
 */
export class GenesisAgent {
    private architect: ArchitectAgent;

    constructor() {
        this.architect = new ArchitectAgent();
    }

    /**
     * Try multiple providers with fallback
     */
    private async llmChatWithFallback(messages: any[], timeoutMs: number = 45000): Promise<string> {
        // Primary: Gemini (most reliable free option)
        try {
            const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
            if (geminiApiKey) {
                console.log('[Genesis] Trying Gemini (Primary)...');
                const { GeminiProvider } = await import('../llm/providers/gemini');
                const gemini = new GeminiProvider(geminiApiKey);
                if (gemini.isAvailable()) {
                    const result = await gemini.chatComplete(messages);
                    if (result && result.trim().length > 10) {
                        console.log('[Genesis] ✅ Gemini succeeded');
                        return result;
                    }
                }
            }
        } catch (e: any) {
            console.warn('[Genesis] Gemini failed:', e.message);
        }

        // Fallback 1: Pollinations
        try {
            console.log('[Genesis] Trying Pollinations fallback...');
            const result = await Promise.race([
                pollinationsProvider.chatComplete(messages, 'openai'),
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Pollinations timeout')), timeoutMs))
            ]);
            if (result && result.trim().length > 10) {
                console.log('[Genesis] ✅ Pollinations fallback succeeded');
                return result;
            }
            console.warn('[Genesis] Pollinations returned empty, trying next fallback...');
        } catch (e: any) {
            console.warn('[Genesis] Pollinations fallback failed:', e.message);
        }

        // Fallback 2: OpenRouter (if available)
        try {
            const openRouterKey = process.env.OPENROUTER_API_KEY;
            if (openRouterKey) {
                console.log('[Genesis] Trying OpenRouter fallback...');
                const { openRouterProvider } = await import('../llm/providers/registry');
                const result = await openRouterProvider.chatComplete(messages, 'mistralai/mistral-7b-instruct');
                if (result && result.trim().length > 10) {
                    console.log('[Genesis] ✅ OpenRouter fallback succeeded');
                    return result;
                }
            }
        } catch (e: any) {
            console.warn('[Genesis] OpenRouter fallback failed:', e.message);
        }

        return ''; // All failed
    }

    /**
     * Extract JSON from LLM response (handles markdown code blocks)
     */
    private extractJson(content: string): any {
        if (!content || typeof content !== 'string') return { steps: [] };

        // Try to find JSON in markdown code blocks
        const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        let jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : content.trim();

        // Try to find JSON object pattern
        const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
            jsonStr = jsonObjMatch[0];
        }

        try {
            return JSON.parse(jsonStr);
        } catch {
            console.warn('[Genesis] JSON parse failed, returning empty steps');
            return { steps: [] };
        }
    }

    /**
     * Generate default scaffold steps for common app types
     */
    private generateDefaultSteps(goal: string): TaskStep[] {
        const goalLower = goal.toLowerCase();
        const isCalculator = /calculator|حاسبة|آلة حاسبة/.test(goalLower);
        const isGreen = /green|أخضر|خضراء|خضر/.test(goalLower);
        const isGame = /game|لعبة/.test(goalLower);
        const isTodo = /todo|مهام|قائمة/.test(goalLower);

        // Extract app name from goal
        const appName = isCalculator ? 'calculator-app'
            : isGame ? 'game-app'
                : isTodo ? 'todo-app'
                    : 'web-app';

        const primaryColor = isGreen ? '#10B981' : '#3B82F6';
        const bgColor = isGreen ? '#ECFDF5' : '#EFF6FF';

        // Default structure for a calculator
        if (isCalculator) {
            return [
                {
                    name: 'Create project structure',
                    tool: 'scaffold_project',
                    args: {
                        name: appName,
                        structure: {
                            'index.html': `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>آلة حاسبة</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="calculator">
        <div class="display" id="display">0</div>
        <div class="buttons">
            <button class="btn clear" onclick="clearDisplay()">C</button>
            <button class="btn operator" onclick="appendToDisplay('/')">/</button>
            <button class="btn operator" onclick="appendToDisplay('*')">×</button>
            <button class="btn operator" onclick="deleteLast()">⌫</button>
            
            <button class="btn" onclick="appendToDisplay('7')">7</button>
            <button class="btn" onclick="appendToDisplay('8')">8</button>
            <button class="btn" onclick="appendToDisplay('9')">9</button>
            <button class="btn operator" onclick="appendToDisplay('-')">-</button>
            
            <button class="btn" onclick="appendToDisplay('4')">4</button>
            <button class="btn" onclick="appendToDisplay('5')">5</button>
            <button class="btn" onclick="appendToDisplay('6')">6</button>
            <button class="btn operator" onclick="appendToDisplay('+')">+</button>
            
            <button class="btn" onclick="appendToDisplay('1')">1</button>
            <button class="btn" onclick="appendToDisplay('2')">2</button>
            <button class="btn" onclick="appendToDisplay('3')">3</button>
            <button class="btn equals" onclick="calculate()">=</button>
            
            <button class="btn zero" onclick="appendToDisplay('0')">0</button>
            <button class="btn" onclick="appendToDisplay('.')">.</button>
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html>`,
                            'styles.css': `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, ${bgColor} 0%, ${primaryColor}22 100%);
}

.calculator {
    background: linear-gradient(145deg, #ffffff, #f0f0f0);
    border-radius: 24px;
    padding: 24px;
    box-shadow: 
        0 25px 50px -12px rgba(0, 0, 0, 0.25),
        0 0 0 1px rgba(255, 255, 255, 0.6) inset;
    width: 320px;
}

.display {
    background: linear-gradient(145deg, #1a1a2e, #16213e);
    color: ${primaryColor};
    font-size: 2.5rem;
    font-weight: 600;
    text-align: left;
    padding: 24px 20px;
    border-radius: 16px;
    margin-bottom: 20px;
    min-height: 80px;
    word-break: break-all;
    box-shadow: inset 0 4px 8px rgba(0, 0, 0, 0.3);
    font-family: 'SF Mono', 'Monaco', monospace;
}

.buttons {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
}

.btn {
    padding: 20px;
    font-size: 1.5rem;
    border: none;
    border-radius: 16px;
    cursor: pointer;
    background: linear-gradient(145deg, #ffffff, #e6e6e6);
    color: #333;
    font-weight: 600;
    transition: all 0.15s ease;
    box-shadow: 
        4px 4px 8px rgba(0, 0, 0, 0.1),
        -4px -4px 8px rgba(255, 255, 255, 0.9);
}

.btn:hover {
    transform: translateY(-2px);
    box-shadow: 
        6px 6px 12px rgba(0, 0, 0, 0.15),
        -6px -6px 12px rgba(255, 255, 255, 0.95);
}

.btn:active {
    transform: translateY(1px);
    box-shadow: 
        2px 2px 4px rgba(0, 0, 0, 0.1),
        -2px -2px 4px rgba(255, 255, 255, 0.8);
}

.btn.operator {
    background: linear-gradient(145deg, ${primaryColor}, ${primaryColor}dd);
    color: white;
}

.btn.clear {
    background: linear-gradient(145deg, #ef4444, #dc2626);
    color: white;
}

.btn.equals {
    background: linear-gradient(145deg, ${primaryColor}, ${primaryColor}cc);
    color: white;
    grid-row: span 2;
}

.btn.zero {
    grid-column: span 2;
}

@media (max-width: 400px) {
    .calculator {
        width: 95%;
        padding: 16px;
    }
    .btn {
        padding: 16px;
        font-size: 1.25rem;
    }
    .display {
        font-size: 2rem;
        padding: 20px 16px;
    }
}`,
                            'script.js': `let displayValue = '0';

function updateDisplay() {
    document.getElementById('display').textContent = displayValue;
}

function appendToDisplay(value) {
    if (displayValue === '0' && value !== '.') {
        displayValue = value;
    } else {
        displayValue += value;
    }
    updateDisplay();
}

function clearDisplay() {
    displayValue = '0';
    updateDisplay();
}

function deleteLast() {
    if (displayValue.length > 1) {
        displayValue = displayValue.slice(0, -1);
    } else {
        displayValue = '0';
    }
    updateDisplay();
}

function calculate() {
    try {
        // Replace × with * for evaluation
        const expression = displayValue.replace(/×/g, '*');
        const result = eval(expression);
        displayValue = String(result);
        updateDisplay();
    } catch (error) {
        displayValue = 'Error';
        updateDisplay();
        setTimeout(() => {
            displayValue = '0';
            updateDisplay();
        }, 1500);
    }
}

// Keyboard support
document.addEventListener('keydown', (e) => {
    const key = e.key;
    if (/[0-9.]/.test(key)) {
        appendToDisplay(key);
    } else if (['+', '-', '*', '/'].includes(key)) {
        appendToDisplay(key);
    } else if (key === 'Enter' || key === '=') {
        calculate();
    } else if (key === 'Escape' || key === 'c' || key === 'C') {
        clearDisplay();
    } else if (key === 'Backspace') {
        deleteLast();
    }
});`
                        }
                    }
                },
                {
                    name: 'Report completion',
                    tool: 'echo',
                    args: {
                        text: `✅ تم بناء آلة حاسبة ${isGreen ? 'خضراء' : ''} بنجاح!\n\nاستخدم dev_server أو افتح index.html مباشرة للمعاينة.`
                    }
                }
            ];
        }

        // Default for other apps
        return [
            {
                name: 'Create basic project',
                tool: 'scaffold_project',
                args: {
                    name: appName,
                    structure: {
                        'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${appName}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <h1>Welcome to ${appName}</h1>
    <script src="script.js"></script>
</body>
</html>`,
                        'styles.css': `body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 2rem; }`,
                        'script.js': `console.log('${appName} loaded');`
                    }
                }
            },
            {
                name: 'Report completion',
                tool: 'echo',
                args: { text: '✅ تم إنشاء المشروع الأساسي!' }
            }
        ];
    }

    async orchestrate(goal: string): Promise<{ plan: string, steps: TaskStep[] }> {
        // 0. Analyze Task Complexity
        const analysis = analyzeTask(goal);
        console.log(`[Genesis] Task Analysis: type=${analysis.type}, complexity=${analysis.complexity}`);

        // FAST PATH: Skip Architect for simple/medium tasks that aren't complex reasoning
        if (analysis.complexity === 'low' || (analysis.complexity === 'medium' && analysis.type !== 'complex_reasoning')) {
            console.log('[Genesis] ⚡ FAST PATH ACTIVATED: Skipping Architect for speed.');

            // [OPTIMIZATION] Retrieve trained reflexes/knowledge
            const optimization = await freeIntelligenceOptimizer.optimizeRequest(goal, []);
            const contextInjection = optimization.cachedResponse
                ? `\n\n[Learned Reflex/Knowledge]:\n${optimization.cachedResponse}`
                : '';

            const fastPrompt = `You are a fast, efficient Task Executor.
The user wants: "${goal}"
${contextInjection}

Generate a concrete list of Tool Execution Steps to achieve this immediately.
Do NOT plan, just execute. Use the [Learned Knowledge] if relevant.

Available Tools:
- Core (Prioritize for Build): scaffold_project, file_write, shell_execute, npm_install, file_edit
- Files: grep_search, file_read, ls
- Web (Verification): browser_action (STRICTLY FORBIDDEN until build is 100% complete)
- Terminal (Presence): terminal_manager (Use for visible console feedback)

CRITICAL CONSTRUCTION PROTOCOL: 
1. Build ALL files locally first.
2. For visible terminal work (audits, scripts), use terminal_manager.
3. DO NOT use the browser for research.
4. Only use the browser to verify the FINAL UI.

Output ONLY valid JSON:
{
  "steps": [
    { "name": "Step Name", "tool": "tool_name", "args": { ... } }
  ]
}`;

            const content = await this.llmChatWithFallback([
                { role: 'system', content: fastPrompt },
            ]);

            const result = this.extractJson(content);

            // Validate steps - if empty, use defaults
            if (!result.steps || !Array.isArray(result.steps) || result.steps.length === 0) {
                console.log('[Genesis] ⚡ LLM returned empty steps, using default scaffold');
                const defaultSteps = this.generateDefaultSteps(goal);
                return {
                    plan: `**Fast Track Execution (Default Scaffold)**\n\nTask: ${goal}\n\nDecision: Used built-in template for reliability.`,
                    steps: defaultSteps
                };
            }

            return {
                plan: `**Fast Track Execution**\n\nTask: ${goal}\n\nDecision: Skipped architecture phase for efficiency.\n[Knowledge Base]: ${optimization.shouldUseCache ? 'Used Learned Reflex ✅' : 'Standard Execution'}`,
                steps: result.steps
            };
        }

        // 1. Architect the solution (Slow Path)
        console.log('[Genesis] summoning Architect...');
        const planMarkdown = await this.architect.planProject(goal);

        // 2. Convert Plan to Executable Steps
        console.log('[Genesis] converting plan to executable steps...');
        const conversionPrompt = `You are the Genesis Orchestrator.
Convert this Architectural Plan into a concrete list of Tool Execution Steps for the 'TaskLoop' agent.

Available Tools (Universal Registry):
- Web (Verification): web_pipeline, dev_server, browser_action, visual_qa
- Interaction (Live Feed): terminal_manager, ask_user

CONSTRUCTION PROTOCOL (NON-NEGOTIABLE): 
1. TERMINAL PRESENCE FIRST: For any shell-based audit or long task, use 'terminal_manager' to show activity in the dashboard's Thermal screen. 'shell_execute' is for silent background work.
2. INTERNAL CONSTRUCTION: Build EVERYTHING local first.
3. BROWSER IS FOR VERIFICATION ONLY.
4. ITERATIVE QUALITY: Fix code based on visual feedback.

Plan:
${planMarkdown}

Output ONLY valid JSON:
{
  "steps": [
    { "name": "Scaffold", "tool": "scaffold_project", "args": { ... } },
    { "name": "Check DB", "tool": "db_schema_migrator", "args": { "action": "status" } }
  ]
}`;

        const content = await this.llmChatWithFallback([
            { role: 'system', content: conversionPrompt },
        ]);

        const result = this.extractJson(content);

        // Validate steps - if empty, use defaults
        if (!result.steps || !Array.isArray(result.steps) || result.steps.length === 0) {
            console.log('[Genesis] Architect path returned empty steps, using default scaffold');
            const defaultSteps = this.generateDefaultSteps(goal);
            return {
                plan: planMarkdown,
                steps: defaultSteps
            };
        }

        return { plan: planMarkdown, steps: result.steps };
    }
}

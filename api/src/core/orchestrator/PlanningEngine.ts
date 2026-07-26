import { StructuredIntent } from '../intelligence/IntentParser';
import { routeToModel, TaskAnalysis } from '../llm/intelligent-router';

export interface ExecutionStep {
    id: string;
    description: string;
    tool: string;
    agent: string;
    input: Record<string, any>;
    dependsOn: string[];
    fallbackStrategy?: 'retry' | 'skip' | 'abort' | 'alternative';
}

export interface ExecutionPlan {
    id: string;
    goal: string;
    steps: ExecutionStep[];
    metadata: {
        complexity: string;
        riskLevel: string;
        estimatedDurationMs?: number;
    };
}

export class PlanningEngine {
    /**
     * Generate a dynamic multi-step execution DAG based on intent and optional memory
     */
    static async generatePlan(params: { intent: StructuredIntent, memory?: any }, traceId?: string, context?: any): Promise<ExecutionPlan> {
        const { intent, memory } = params;
        const goalLower = String(intent.goal || '').toLowerCase();

        // [BUILD FAST-PATH] "build/create a web page/site/app" -> ACTUALLY build it:
        // generate the code, write the file, and open it in the live preview. This is
        // deterministic (reliable even on weak free models) and makes Joe execute like
        // an engineering team instead of just replying with code text.
        const buildVerb = /\b(build|create|make|develop|design|generate|code|scaffold)\b/.test(goalLower)
            || /(ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|سو)/.test(intent.goal || '');
        const webNoun = /\b(page|site|website|web ?app|landing|portfolio|dashboard|form|store|shop|html|ui|interface)\b/.test(goalLower)
            || /(صفحة|موقع|تطبيق|واجهة|متجر|لوحة|نموذج|بورتفوليو|معرض|هبوط)/.test(intent.goal || '');
        // Route follow-up edits (add button / change colour / ...) to the SAME page.
        const activeKey = String((context && context.sessionId) || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const hasActivePage = !!((global as any).joePages && (global as any).joePages[activeKey]);
        const editIntent = /\b(add|change|modify|update|edit|remove|bigger|smaller|colou?r|button|background|header|footer|font|title)\b/i.test(goalLower)
            || /(أضف|اضف|غيّر|غير|عدّل|عدل|بدّل|بدل|اجعل|احذف|كبّر|صغّر|لون|زر|خلفية|حجم|عنوان|خط)/.test(intent.goal || '');
        if ((buildVerb && webNoun) || (hasActivePage && editIntent)) {
            return {
                id: `build_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'build_page',
                    description: `Building: ${intent.goal}`,
                    tool: 'web_page_builder',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' }
            };
        }

        // [BROWSER SMART TOOLS FAST-PATH] summarise / audit a URL reliably.
        const goalRaw = intent.goal || '';
        const urlMatch = goalRaw.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);
        const summarizeIntent = /(لخّ?ص|تلخيص|summari[sz]e|اقرأ\s*الصفحة|ما\s*مضمون)/i.test(goalRaw);
        const auditIntent = /(دقّ?ق|تدقيق|افحص\s*الواجهة|audit|فحص\s*ui|راجع\s*التصميم|مشاكل\s*الواجهة|accessib)/i.test(goalRaw);
        const extractIntent = /(استخرج|استخراج|extract|جدول|قائمة|csv|بيانات\s*الصفحة)/i.test(goalRaw);
        const linksIntent = /(روابط\s*مكسور|مكسور|broken\s*links|فحص\s*الروابط|check\s*links)/i.test(goalRaw);
        const perfIntent = /(أداء|السرعة|سرعة\s*الصفحة|performance|speed|زمن\s*التحميل)/i.test(goalRaw);
        const seoIntent = /(seo|سيو|تحسين\s*محركات|meta\s*tags|الوسوم)/i.test(goalRaw);
        const compareIntent = /(قارن|مقارنة|before\s*\/?\s*after|قبل\s*وبعد|قبل\/بعد)/i.test(goalRaw);
        const consoleIntent = /(أخطاء|errors?|console|كونسول|جافا\s*سكربت|javascript|أعطال)/i.test(goalRaw);
        const pdfIntent = /(pdf|احفظ.*صفحة|صدّ?ر.*صفحة|export\s*pdf|save\s*pdf)/i.test(goalRaw);
        const readIntent = /(المقال|اقرأ\s*المقال|readab|article|نص\s*المقال|محتوى\s*نظيف)/i.test(goalRaw);
        const contrastIntent = /(تباين|contrast|ألوان\s*الوصول|wcag)/i.test(goalRaw);
        const a11yIntent = /(وصولية|accessib|a11y|aria|قارئ\s*الشاشة|لوحة\s*المفاتيح)/i.test(goalRaw);
        const metaIntent = /(بيانات\s*وصفية|metadata|meta\s*tags|structured\s*data|json-?ld|الوسوم\s*الوصفية)/i.test(goalRaw);
        const translateIntent = /(ترجم|ترجمة|translate|translation|بالعربية|to\s*(english|arabic|french))/i.test(goalRaw);
        const responsiveIntent = /(تجاوب|responsive|الجوال|موبايل|mobile\s*view|أحجام\s*الشاشات|شاشات|breakpoints?)/i.test(goalRaw);
        const findIntent = /(ابحث\s*عن|جد\s|find\s|أين\s*ورد|كم\s*مرة|highlight|ظلّل|علّم)/i.test(goalRaw);
        const designIntent = /(نظام\s*التصميم|الألوان|ألوان\s*الصفحة|design\s*tokens?|palette|لوحة\s*ألوان|الخطوط\s*المستخدمة|typography)/i.test(goalRaw);
        const clickIntent = /(انقر|اضغط|click|press|فعّل\s*الزر|اضغط\s*على)/i.test(goalRaw);
        const fullshotIntent = /(لقطة\s*كاملة|screenshot\s*كامل|full\s*page|صورة\s*كاملة|كامل\s*الصفحة|طويلة)/i.test(goalRaw);
        const agentIntent = /(تحليل\s*شامل|تقرير\s*شامل|حلّ?ل\s*الصفحة\s*بالكامل|وكيل\s*ذكي|smart\s*agent|full\s*analysis|analyze\s*(the\s*)?page|فحص\s*شامل|كل\s*شيء\s*عن\s*الصفحة)/i.test(goalRaw);
        const autofixIntent = /(أصلح|اصلح|إصلاح\s*تلقائي|autofix|auto-?fix|صحّح\s*الصفحة|رقّع|عالج\s*المشاكل|fix\s*(the\s*)?(page|issues))/i.test(goalRaw);
        if (urlMatch && (autofixIntent || agentIntent || summarizeIntent || auditIntent || extractIntent || linksIntent || perfIntent || seoIntent || compareIntent || consoleIntent || pdfIntent || readIntent || contrastIntent || a11yIntent || metaIntent || translateIntent || responsiveIntent || findIntent || designIntent || clickIntent || fullshotIntent)) {
            const tool = autofixIntent ? 'browser_autofix'
                : agentIntent ? 'browser_smart_agent'
                : clickIntent ? 'browser_click'
                : fullshotIntent ? 'browser_fullpage_shot'
                : designIntent ? 'browser_design_tokens'
                : findIntent ? 'browser_find_text'
                : responsiveIntent ? 'browser_responsive_check'
                : translateIntent ? 'browser_translate'
                : metaIntent ? 'browser_extract_meta'
                : a11yIntent ? 'browser_a11y_deep'
                : contrastIntent ? 'browser_contrast_audit'
                : readIntent ? 'browser_readability'
                : pdfIntent ? 'browser_save_pdf'
                : consoleIntent ? 'browser_console_scan'
                : compareIntent ? 'browser_compare'
                : linksIntent ? 'browser_check_links'
                : perfIntent ? 'browser_performance'
                : seoIntent ? 'browser_seo_audit'
                : extractIntent ? 'browser_extract_data'
                : auditIntent ? 'browser_ui_audit'
                : 'browser_summarize';
            const urls = goalRaw.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/ig) || [urlMatch[0]];
            const smartInput: any = { url: urlMatch[0], question: intent.goal, request: intent.goal };
            if (tool === 'browser_compare' && urls.length >= 2) { smartInput.before = urls[0]; smartInput.after = urls[1]; }
            if (tool === 'browser_translate') {
                const tm = goalRaw.match(/to\s+(english|arabic|french|spanish|german|turkish)|إلى\s*(الإنجليزية|الانجليزية|العربية|الفرنسية)/i);
                if (tm) smartInput.target = (tm[1] || tm[2] || '').toLowerCase();
            }
            if (tool === 'browser_find_text') {
                // pull the search term: quoted text, or the words after "find"/"ابحث عن"
                const qm = goalRaw.match(/[«"'"]([^«»"'"]+)[»"'"]/)
                    || goalRaw.match(/(?:ابحث\s*عن|جد|find|search\s*for)\s+([^\s].{0,60})/i);
                if (qm) smartInput.query = String(qm[1]).replace(/\s+(في|على|بالصفحة|in|on)\b.*$/i, '').trim();
            }
            if (tool === 'browser_click') {
                // pull the button/link label: quoted text, or the words after "click"/"انقر"
                const cm = goalRaw.match(/[«"'"]([^«»"'"]+)[»"'"]/)
                    || goalRaw.match(/(?:انقر\s*(?:على)?|اضغط\s*(?:على)?|click|press)\s+([^\s].{0,50})/i);
                if (cm) smartInput.text = String(cm[1]).replace(/\s+(في|على\s*الصفحة|زر|in|on|the\s*button)\b.*$/i, '').trim();
            }
            return {
                id: `browser_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_smart',
                    description: `${tool} on ${urlMatch[0]}`,
                    tool,
                    agent: 'Browser',
                    input: smartInput,
                    dependsOn: []
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' }
            };
        }

        // [OPEN BROWSER FAST-PATH] "open the browser", "go to <url>", "visit <site>".
        // This must be deterministic: a bare "افتح المتصفح" has no URL, so it would
        // otherwise fall through to the LLM DAG planner (which on weak free models
        // returns malformed JSON and invents non-existent tools). Route it straight
        // to browser_open, which navigates the LIVE-streamed session so the user
        // actually watches the page load.
        const openBrowserIntent = /(افتح|شغّ?ل|شغل|ادخل|روح|اذهب|استخدم|جرّ?ب|شوف|اعرض)\s*(لي\s*)?(ال)?(متصفح|براوزر|المتصفّح)|open\s*(the\s*)?browser|launch\s*browser|use\s*(the\s*)?browser|شغّ?ل\s*المتصفح/i.test(goalRaw);
        const navigateIntent = /(اذهب\s*(إلى|الى|ل)|روح\s*(إلى|الى|ل)|افتح\s+(موقع|رابط|صفحة|الموقع)?|زر\s+(الموقع|الرابط)|ادخل\s+(موقع|على)|تصفّ?ح|عايِ?ن|افحص\s+الموقع|go\s*to|navigate\s*(to)?|visit|browse|open)\b/i.test(goalRaw);
        const browserWord = /(متصفح|براوزر|browser|الويب\b|صفحة\s*الويب|الموقع|website|web\s*page)/i.test(goalRaw);
        // Route to the live browser when: an explicit open/use-browser phrasing is
        // present; OR a URL is mentioned with any navigate/browser cue; OR the
        // intent analyser already decided this is a Browser task. Deterministic so
        // it never falls into the weak-model DAG planner.
        if (openBrowserIntent
            || (urlMatch && (navigateIntent || browserWord))
            || (urlMatch && String(intent.suggestedAgent || '') === 'Browser')) {
            return {
                id: `browser_open_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_open',
                    description: urlMatch ? `Open browser at ${urlMatch[0]}` : 'Open the live browser',
                    tool: 'browser_launch',
                    agent: 'Browser',
                    input: { url: urlMatch ? urlMatch[0] : '', request: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'low', riskLevel: 'low' }
            };
        }

        // [ELITE FAST-PATH] Direct answer for general questions or chat
        if ((intent as any).type === 'general' || (intent as any).type === 'chat' || intent.goal.length < 30) {
            return {
                id: `chat_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'direct_response',
                    description: `Answering: ${intent.goal}`,
                    tool: 'central_answer',
                    agent: 'General',
                    input: { question: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'low', riskLevel: 'low' }
            };
        }

        console.log(`[PlanningEngine] Generating REAL-TIME DAG for: ${intent.goal}`);

        const historyContext = memory ? `\nPrevious Execution History:\n${JSON.stringify(memory)}` : "";

        const entropySeed = Math.random().toString(36).substring(7);
        const systemPrompt = `You are a Professional Software Architecture Planner.
Generate a dynamic Execution DAG (Directed Acyclic Graph) for the given goal.

Entropy Seed: ${entropySeed} (Use this to explore different optimal paths if possible)

Constraints:
- Use ONLY existing tools: shell_execute, read_file, write_file, browser_run, grep_search, ls, npm_manager.
- Define explicit dependencies (dependsOn).
- Assign an agent to each node: Dev, Security, Browser, General.
- DO NOT use static templates. Analyze the specific goal from a fresh perspective.
- Provide a brief "reasoning" field for EACH step explaining why this path was chosen.

Goal: ${intent.goal}
Complexity: ${intent.complexity}
Risk: ${intent.riskLevel}${historyContext}

Return ONLY a JSON array of steps:
[
  { 
    "id": "node_id", 
    "task": "precise task description", 
    "tool": "tool_name", 
    "agent": "agent_type", 
    "input": { "instruction": "..." }, 
    "dependsOn": ["prev_node_id"] 
  }
]`;

        try {
            // Using routeToModel for planning
            const response = await routeToModel([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Analyze goal and generate DAG for: ${intent.goal}` }
            ], undefined, undefined, undefined, undefined, undefined, undefined, context);

            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const rawSteps = JSON.parse(jsonMatch[0]);
                const steps: ExecutionStep[] = (Array.isArray(rawSteps) ? rawSteps : []).map((step: any) => ({
                    id: String(step.id || `step_${Math.random().toString(36).substring(7)}`),
                    description: String(step.description || step.task || step.task_description || `Execute task`),
                    tool: String(step.tool || 'shell_execute'),
                    agent: String(step.agent || 'General'),
                    input: step.input || {},
                    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : []
                }));
                
                return {
                    id: `dag_${Date.now()}`,
                    goal: intent.goal,
                    steps,
                    metadata: {
                        complexity: intent.complexity,
                        riskLevel: intent.riskLevel
                    }
                };
            }
        } catch (err) {
            console.error('[PlanningEngine] Dynamic DAG generation failed:', err);
        }

        // Emergency Fallback (Dynamic but minimal)
        console.warn(`[PlanningEngine] Using failover node for: ${intent.goal}`);
        const isBrowserFallback = (intent.suggestedAgent === 'Browser') || (intent.requiredTools && intent.requiredTools.includes('browser_run')) || !!urlMatch;
        // For browser intents, open the live browser deterministically instead of
        // the generic browser_run (which needs explicit actions and otherwise dies
        // with "actions_or_instruction_required" -> "Recovery failed").
        return {
            id: `failover_${Date.now()}`,
            goal: intent.goal,
            steps: [{
                id: isBrowserFallback ? 'browser_open' : 'recovery_node',
                description: `Respond to: ${intent.goal}`,
                tool: isBrowserFallback ? 'browser_launch' : 'central_answer',
                agent: isBrowserFallback ? 'Browser' : (intent.suggestedAgent || 'General'),
                input: isBrowserFallback ? { url: urlMatch ? urlMatch[0] : '', request: intent.goal } : { question: intent.goal },
                dependsOn: []
            }],
            metadata: { complexity: 'low', riskLevel: 'low' }
        };
    }
}

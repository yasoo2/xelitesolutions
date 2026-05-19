import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import * as routerModule from '../../core/llm/intelligent-router';
import intelligentRouter from '../../core/llm/intelligent-router';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Joe Premium Task Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #08090c;
            --bg-secondary: #0f111a;
            --accent-primary: #8b5cf6;
            --accent-secondary: #ec4899;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --glass-bg: rgba(255, 255, 255, 0.02);
            --glass-border: rgba(255, 255, 255, 0.05);
            --glow-color: rgba(139, 92, 246, 0.15);
            --font-main: 'Outfit', sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-font-smoothing: antialiased;
        }

        body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            font-family: var(--font-main);
            min-height: 100vh;
            display: flex;
            overflow: hidden;
        }

        /* Sidebar Styling */
        .sidebar {
            width: 280px;
            background: var(--bg-secondary);
            border-right: 1px solid var(--glass-border);
            display: flex;
            flex-direction: column;
            padding: 24px;
            z-index: 10;
        }

        .logo-section {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 40px;
        }

        .logo-icon {
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            color: white;
            box-shadow: 0 0 15px var(--glow-color);
        }

        .logo-text {
            font-size: 20px;
            font-weight: 800;
            background: linear-gradient(to right, #ffffff, var(--text-secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: 0.5px;
        }

        .nav-links {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .nav-item a {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            color: var(--text-secondary);
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .nav-item.active a, .nav-item a:hover {
            color: white;
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            transform: translateX(4px);
        }

        /* Main Content Container */
        .main-content {
            flex: 1;
            padding: 40px;
            overflow-y: auto;
            position: relative;
        }

        /* Ambient Glow Background Effect */
        .ambient-glow {
            position: absolute;
            top: -200px;
            right: -200px;
            width: 600px;
            height: 600px;
            background: radial-gradient(circle, var(--glow-color) 0%, transparent 70%);
            z-index: 1;
            pointer-events: none;
        }

        /* Header Section */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
            position: relative;
            z-index: 2;
        }

        .welcome-title {
            font-size: 32px;
            font-weight: 800;
            letter-spacing: -0.5px;
            margin-bottom: 6px;
        }

        .welcome-subtitle {
            color: var(--text-secondary);
            font-size: 15px;
        }

        /* Dashboard Cards Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 24px;
            margin-bottom: 40px;
            position: relative;
            z-index: 2;
        }

        .stat-card {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            backdrop-filter: blur(12px);
            border-radius: 16px;
            padding: 24px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .stat-card:hover {
            border-color: rgba(139, 92, 246, 0.3);
            box-shadow: 0 10px 30px rgba(139, 92, 246, 0.05);
            transform: translateY(-4px);
        }

        .stat-label {
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 12px;
        }

        .stat-value {
            font-size: 28px;
            font-weight: 800;
            margin-bottom: 8px;
        }

        .stat-trend {
            font-size: 12px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .trend-up { color: #10b981; }
        .trend-down { color: #ef4444; }

        /* Tasks Section Container */
        .tasks-container {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            backdrop-filter: blur(12px);
            border-radius: 20px;
            padding: 32px;
            position: relative;
            z-index: 2;
        }

        .tasks-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }

        .tasks-title {
            font-size: 20px;
            font-weight: 700;
        }

        .task-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .task-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px;
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            transition: all 0.3s ease;
        }

        .task-item:hover {
            background: rgba(255, 255, 255, 0.02);
            border-color: rgba(255, 255, 255, 0.1);
            transform: scale(1.01);
        }

        .task-info {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .task-checkbox {
            appearance: none;
            width: 22px;
            height: 22px;
            border: 2px solid var(--glass-border);
            border-radius: 6px;
            cursor: pointer;
            position: relative;
            transition: all 0.2s ease;
        }

        .task-checkbox:checked {
            background: var(--accent-primary);
            border-color: var(--accent-primary);
        }

        .task-checkbox:checked::after {
            content: '✓';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 12px;
            font-weight: bold;
        }

        .task-details {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .task-name {
            font-size: 16px;
            font-weight: 600;
        }

        .task-meta {
            font-size: 12px;
            color: var(--text-secondary);
            font-family: var(--font-mono);
        }

        .badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-high {
            background: rgba(239, 68, 68, 0.1);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .badge-medium {
            background: rgba(245, 158, 11, 0.1);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .badge-low {
            background: rgba(59, 130, 246, 0.1);
            color: #60a5fa;
            border: 1px solid rgba(59, 130, 246, 0.2);
        }

        /* Animations */
        @keyframes fadeInSlide {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .main-content > * {
            animation: fadeInSlide 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .stats-grid { animation-delay: 0.1s; }
        .tasks-container { animation-delay: 0.2s; }
    </style>
</head>
<body>
    <!-- Sidebar -->
    <aside class="sidebar">
        <div class="logo-section">
            <div class="logo-icon">J</div>
            <span class="logo-text">Joe Systems</span>
        </div>
        <ul class="nav-links">
            <li class="nav-item active"><a href="#">Dashboard</a></li>
            <li class="nav-item"><a href="#">Projects</a></li>
            <li class="nav-item"><a href="#">Analytics</a></li>
            <li class="nav-item"><a href="#">Settings</a></li>
        </ul>
    </aside>

    <!-- Main Workspace -->
    <main class="main-content">
        <div class="ambient-glow"></div>
        
        <!-- Header -->
        <header class="header">
            <div>
                <h1 class="welcome-title">System Dashboard</h1>
                <p class="welcome-subtitle">Workspace Overview & Active Tasks</p>
            </div>
        </header>

        <!-- Stats Grid -->
        <section class="stats-grid">
            <div class="stat-card">
                <p class="stat-label">Total Completed Tasks</p>
                <h3 class="stat-value">28</h3>
                <span class="stat-trend trend-up">↑ 12% vs last week</span>
            </div>
            <div class="stat-card">
                <p class="stat-label">System Health</p>
                <h3 class="stat-value">100%</h3>
                <span class="stat-trend trend-up">Stable</span>
            </div>
            <div class="stat-card">
                <p class="stat-label">Active Deployments</p>
                <h3 class="stat-value">3</h3>
                <span class="stat-trend trend-up">Hetzner joe-server-1</span>
            </div>
        </section>

        <!-- Tasks Container -->
        <section class="tasks-container">
            <div class="tasks-header">
                <h2 class="tasks-title">Priority Tasks</h2>
            </div>
            <div class="task-list">
                <div class="task-item">
                    <div class="task-info">
                        <input type="checkbox" class="task-checkbox" checked>
                        <div class="task-details">
                            <span class="task-name">Run guard validation suite</span>
                            <span class="task-meta">trace-id: guard-check-ok</span>
                        </div>
                    </div>
                    <span class="badge badge-high">High</span>
                </div>
                <div class="task-item">
                    <div class="task-info">
                        <input type="checkbox" class="task-checkbox">
                        <div class="task-details">
                            <span class="task-name">Configure API health check alerts</span>
                            <span class="task-meta">trace-id: system-alerting</span>
                        </div>
                    </div>
                    <span class="badge badge-medium">Medium</span>
                </div>
                <div class="task-item">
                    <div class="task-info">
                        <input type="checkbox" class="task-checkbox">
                        <div class="task-details">
                            <span class="task-name">Refactor ToolService normalization layer</span>
                            <span class="task-meta">trace-id: path-aliasing-fix</span>
                        </div>
                    </div>
                    <span class="badge badge-low">Low</span>
                </div>
            </div>
        </section>
    </main>
</body>
</html>
`;

// Inject routing mocks to prevent rate-limited/failed remote LLM calls
const originalRouteToModel = routerModule.routeToModel;

const mockRouteToModel = async (messages: any[], ...args: any[]): Promise<string> => {
    const promptText = JSON.stringify(messages);
    console.log(`[MOCK ROUTER] Intercepted call (length: ${promptText.length}): ${promptText.substring(0, 120)}...`);
    
    // 1. Intent parser mock
    if (promptText.includes('Senior Strategic Intent Analyst')) {
        console.log('✨ [MOCK ROUTER] Matched: Intent Parser');
        return JSON.stringify({
            primary: 'Create a premium, modern dashboard web page in a file named dashboard.html',
            domain: 'Dev',
            complexity: 'medium',
            riskLevel: 'low',
            requirements: ['write_file'],
            successCriteria: ['dashboard.html created with beautiful styling'],
            suggestedAgent: 'Dev'
        });
    }

    // 2. Planning engine mock
    if (promptText.includes('Professional Software Architecture Planner')) {
        console.log('✨ [MOCK ROUTER] Matched: Planning Engine');
        return JSON.stringify([
            {
                id: 'write_dashboard_page',
                description: 'Create the premium dashboard HTML page with glassmorphism, dark mode, sidebar, animations, and active tasks list.',
                tool: 'write_file',
                agent: 'Dev',
                input: {},
                dependsOn: []
            }
        ]);
    }

    // 3. Task complexity/risk analyzer mock
    if (promptText.includes('Complexity and Risk') || promptText.includes('Task Complexity and Risk')) {
        console.log('✨ [MOCK ROUTER] Matched: Complexity/Risk Analyzer');
        return JSON.stringify({
            complexity: 'medium',
            riskLevel: 'low',
            type: 'code_generation',
            requiresTools: true,
            estimatedTokens: 1000,
            language: 'en'
        });
    }

    // 4. Agent dispatcher mock
    if (promptText.includes('Dispatcher for a Multi-Agent System')) {
        console.log('✨ [MOCK ROUTER] Matched: Agent Dispatcher');
        return 'Dev';
    }

    // 5. JoeAgent task executor tool selection mock
    if (promptText.includes('Professional AI Agent') || promptText.includes('Choose the single best tool')) {
        console.log('✨ [MOCK ROUTER] Matched: Tool Selector');
        return JSON.stringify({
            tool: 'write_file',
            args: {
                filename: 'dashboard.html',
                content: dashboardHtml
            },
            reasoning: 'Creating the premium dashboard HTML page with glassmorphism CSS layout and tasks list.'
        });
    }

    console.log('⚠️ [MOCK ROUTER] No match. Routing to original provider.');
    return originalRouteToModel(messages, ...args);
};

// Override named export and class/object property
(routerModule as any).routeToModel = mockRouteToModel;
(intelligentRouter as any).routeToModel = mockRouteToModel;

async function verifyJoeBuildPage() {
    console.log('🧪 Starting verify_joe_build_page test...');
    console.log('This test prompts Joe to build a beautiful, premium page and verifies execution.');

    process.env.JOE_PRO_ALPHA = '1';
    
    // Set a custom external projects directory
    const projectsRoot = path.join(process.cwd(), 'data/tests/joe_build_page');
    process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

    if (fs.existsSync(projectsRoot)) {
        fs.rmSync(projectsRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(projectsRoot, { recursive: true });

    const sessionId = 'session-joe-page-' + Date.now();
    const workspaceId = 'dashboard-project-workspace';
    const userId = 'user-test-page';

    const testWorkspacePath = path.join(projectsRoot, workspaceId);
    fs.mkdirSync(testWorkspacePath, { recursive: true });

    // Pre-create package.json so workspace is recognized properly
    fs.writeFileSync(path.join(testWorkspacePath, 'package.json'), JSON.stringify({
        name: 'premium-dashboard',
        version: '1.0.0',
        private: true
    }));

    // Import AgentOrchestrator *after* mocking LLM router to ensure correct module binding
    const { AgentOrchestrator } = require('../../orchestration/AgentOrchestrator');
    const orchestrator = new AgentOrchestrator();

    const goal = 'Create a premium, modern dashboard web page in a file named "dashboard.html" in the root directory. ' +
                 'It must feature a clean dashboard layout, sidebar, active tasks list, glassmorphism aesthetics, dark mode by default, ' +
                 'and smooth CSS animations. Make it look state-of-the-art and professional.';

    console.log(`\n🚀 Submitting goal to Joe Orchestrator: "${goal}"`);

    const result = await orchestrator.execute({
        id: 'run-joe-page-' + Date.now(),
        goal,
        context: { sessionId, workspaceId, userId }
    });

    console.log('\n--- Execution Complete ---');
    console.log('Success:', result.ok);
    console.log('Result details:', JSON.stringify(result.result, null, 2));

    const htmlFile = path.join(testWorkspacePath, 'dashboard.html');
    let passed = true;

    if (fs.existsSync(htmlFile)) {
        const content = fs.readFileSync(htmlFile, 'utf8');
        console.log(`\n✅ dashboard.html created successfully (${content.length} bytes).`);
        
        // Basic quality validations
        const checks = [
            { name: 'HTML structure', pattern: /<html/i },
            { name: 'CSS styles/styling', pattern: /<style|style=/i },
            { name: 'Task Dashboard content', pattern: /dashboard|task/i },
            { name: 'Premium layout/elements', pattern: /sidebar|main|container/i }
        ];

        for (const check of checks) {
            if (check.pattern.test(content)) {
                console.log(`  - PASS: Contains ${check.name}`);
            } else {
                console.warn(`  - WARNING: Missing ${check.name} pattern`);
                passed = false;
            }
        }
    } else {
        console.error(`\n❌ FAIL: dashboard.html was NOT created.`);
        passed = false;
    }

    console.log('\n✨ Page Creation Verification:', passed ? 'PASSED' : 'FAILED');
    if (!passed) process.exit(1);
    process.exit(0);
}

verifyJoeBuildPage().catch(e => {
    console.error('💥 Test crashed:', e);
    process.exit(1);
});

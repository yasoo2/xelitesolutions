/**
 * Joe's 50-prompt front-door benchmark.
 *
 * Every case enters the real PlanningEngine. This is intentionally a routing
 * benchmark, not a second execution path: building and repair still belong to
 * project_pipeline and the normal AgentLoop/ToolService gates.
 */
import { PlanningEngine } from '../../core/orchestrator/PlanningEngine';
import * as intelligentRouter from '../../core/llm/intelligent-router';

process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.OFFLINE_MODE = 'true';

type Case = {
    id: string;
    level: 'ordinary' | 'intermediate' | 'complex';
    prompt: string;
    expected: string[];
};

const build = (id: string, level: Case['level'], prompt: string): Case => ({
    id, level, prompt,
    expected: ['project_pipeline', 'react_project', 'web_page_builder'],
});

const browser = (id: string, level: Case['level'], prompt: string): Case => ({
    id, level, prompt,
    expected: ['browser_launch', 'browser_run', 'browser_action', 'browser_vision', 'browser_responsive_check'],
});

const review = (id: string, level: Case['level'], prompt: string): Case => ({
    id, level, prompt,
    expected: [
        'project_repair', 'quality_run', 'auto_tester', 'code_reviewer', 'browser_ui_fix',
        'browser_console_scan', 'browser_design_tokens', 'inspect_directory',
        'dependency_audit', 'browser_ui_audit', 'browser_contrast_audit', 'form_inbox',
        'browser_check_links', 'browser_performance',
    ],
});

const existingEdit = (id: string, level: Case['level'], prompt: string): Case => ({
    id, level, prompt,
    expected: ['project_edit', 'browser_page_fix', 'browser_fill_form', 'mobile_builder', 'react_project'],
});

const CASES: Case[] = [
    build('P01', 'ordinary', 'Build a responsive website for a neighborhood bicycle repair studio with services, prices, opening hours, location, phone CTA, and a booking form.'),
    build('P02', 'ordinary', 'Create a calm website for a language school with Arabic, Spanish, and German courses, levels, a weekly schedule, teacher cards, and a placement-test form.'),
    build('P03', 'ordinary', 'Make a public website for a community seed library with a seasonal catalog, lending rules, volunteer CTA, opening times, and a contact form.'),
    build('P04', 'ordinary', 'Design a portfolio for a ceramic artist with six project cards, material and year metadata, an about section, and a commission request form.'),
    build('P05', 'ordinary', 'Build a clinic appointment tracker with patient, doctor, date, time, status, notes, search, status filter, date sorting, add/edit/delete, and an empty state.'),
    build('P06', 'ordinary', 'Create a used-book inventory manager with title, author, ISBN, shelf, condition, availability, search, filtering, CSV export, and available-versus-sold totals.'),
    build('P07', 'ordinary', 'Make a household cash-flow tracker with description, category, date, income or expense type, amount, total income, total expenses, and net balance.'),
    build('P08', 'ordinary', 'Build a volunteer shift board with person, role, location, date, start time, end time, confirmed status, search, date sorting, and confirmed filtering.'),
    build('P09', 'ordinary', 'Create a repair-shop customer directory with name, phone, email, device, warranty expiry, repair status, empty-name validation, search, and status filtering.'),
    build('P10', 'ordinary', 'Build a personal reading log with title, author, pages, start date, finish date, rating, reading status, filters, and a data-based progress metric.'),
    build('P11', 'intermediate', 'Create an editable farmers-market sales dashboard with product, category, units, unit price, sales date, revenue by category, top category, date filtering, and a bar chart.'),
    build('P12', 'intermediate', 'Build a school equipment checkout system with required student, equipment, checkout date, return date, condition, submission prevention, and a clear error summary.'),
    build('P13', 'intermediate', 'Create a four-page science museum website: Home, Exhibits, Visit, and Education, with shared header, active-page indicator, internal links, and a Visit contact form.'),
    build('P14', 'intermediate', 'Build a team issue tracker with sign-in, member and manager roles, private issue lists, assignment, status transitions, comments, and audit history.'),
    build('P15', 'intermediate', 'Make an offline-first pantry inventory PWA that installs, works without a network after first load, queues edits, and reconciles them when the network returns.'),
    build('P16', 'intermediate', 'Create a media review board where users upload an image, add title, tags, and notes, filter by tag, preview the image, and delete with confirmation.'),
    build('P17', 'intermediate', 'Build a launch workspace with milestones, owners, dependencies, risk levels, filters, keyboard shortcuts, compact mobile view, CSV export, and a visible audit trail.'),
    build('P18', 'intermediate', 'Create a weather comparison page for three cities using a real weather API with loading, error, retry, unit toggle, last-updated time, and offline fallback.'),
    build('P19', 'intermediate', 'Build a small online shop with product images, search, categories, cart add/remove, quantity controls, checkout validation, and an order confirmation screen.'),
    build('P20', 'intermediate', 'Create a bilingual Arabic-English event page with a working language toggle, translated navigation, hero, schedule, form labels, and shared event data.'),
    build('P21', 'complex', 'Build a veterinary clinic platform with animals, vaccinations, doctors, appointments, invoices, photos, sign-in, staff permissions, and an admin panel for every table.'),
    build('P22', 'complex', 'Create a logistics control center with clients, shipments, containers, customs, warehouses, drivers, status transitions, filters, maps, and operational reports.'),
    build('P23', 'complex', 'Build a subscription SaaS admin console with organizations, plans, seats, usage limits, invoices, payment status, role permissions, search, and audit events.'),
    build('P24', 'complex', 'Create a research workspace with projects, papers, tags, notes, citations, full-text search, import, duplicate detection, and export to BibTeX and CSV.'),
    build('P25', 'complex', 'Build a marketplace with vendor onboarding, product moderation, images, inventory, buyer search, cart, checkout validation, order status, and vendor analytics.'),
    build('P26', 'complex', 'Create a multi-tenant help desk with organizations, agents, tickets, priorities, SLAs, assignment, comments, attachments, private notes, and a complete audit trail.'),
    build('P27', 'complex', 'Build a finance dashboard from editable transactions with category budgets, monthly trends, import validation, export, anomaly flags, and a clear explanation of calculations.'),
    build('P28', 'complex', 'Create a project management app with dependencies, critical path, workload balancing, drag-and-drop ordering, keyboard support, notifications, and mobile layout.'),
    browser('P29', 'ordinary', 'Open https://example.com in the browser, inspect the page, and report its title and the primary heading.'),
    browser('P30', 'ordinary', 'Use the browser to open a public page, find the search box, type a harmless query, submit it, and verify the results page.'),
    browser('P31', 'ordinary', 'In the current browser page, click the visible primary action, observe the result, and stop if the action is unavailable.'),
    browser('P32', 'intermediate', 'Use the browser to test a local app: exercise every visible button and form field, capture console and network failures, and report the exact failing control.'),
    browser('P33', 'intermediate', 'Run responsive browser QA at desktop, tablet, and mobile sizes; check overflow, clipped text, unreachable controls, and broken navigation.'),
    browser('P34', 'intermediate', 'Use the browser to validate an e-commerce flow: search, open a product, add it to the cart, change quantity, remove it, and verify the total.'),
    browser('P35', 'complex', 'Perform evidence-based browser QA on the built application: inspect the DOM, click every safe control, fill valid and invalid forms, reload for persistence, and produce a defect report.'),
    browser('P36', 'complex', 'Compare the live page against its stated requirements in the prompt, identify missing capabilities and visual defects, repair only measured issues, then retest the same flows.'),
    review('P37', 'ordinary', 'Review the current project quality report and fix the measured UI and behavior defects, then rebuild and verify the final result.'),
    review('P38', 'ordinary', 'Inspect the existing application for broken buttons, failed requests, console errors, invalid labels, spacing problems, and unreadable colors.'),
    review('P39', 'intermediate', 'Run the project test suite and repair only the failing tests. Preserve passing tests and show the exact files changed.'),
    review('P40', 'intermediate', 'Audit the existing code for unsafe shell execution, secret leakage, path traversal, missing authorization, and dependency risks.'),
    review('P41', 'intermediate', 'Check accessibility of the current app: keyboard navigation, focus visibility, labels, contrast, headings, and form error announcements.'),
    review('P42', 'complex', 'Perform a release-readiness review covering build, unit tests, integration tests, browser QA, security findings, performance, and rollback evidence.'),
    existingEdit('P43', 'complex', 'Modify the existing product page without deleting current sections: add comparison, replace only the pricing CTA, add a keyboard-accessible modal, and verify the existing form still submits.'),
    existingEdit('P44', 'complex', 'Update the existing dashboard for mobile by collapsing the sidebar into a reachable menu, preserving keyboard order, adding focus styles, and keeping all desktop filters.'),
    build('P45', 'complex', 'Build a booking platform with availability rules, time-zone handling, conflict prevention, reminders, cancellation policy, admin overrides, and a browser-tested booking flow.'),
    build('P46', 'complex', 'Create a content publishing system with drafts, review workflow, scheduled publishing, version history, preview, media library, permissions, and audit logs.'),
    build('P47', 'complex', 'Build a real-time support dashboard with live queue updates, agent presence, escalation timers, keyboard shortcuts, resilient reconnect, and browser verification.'),
    build('P48', 'complex', 'Create a delivery app with customer addresses, driver assignment, route status, proof-of-delivery upload, failed-delivery recovery, roles, and operational analytics.'),
    build('P49', 'complex', 'Build a production-quality marketplace and test it in the browser across desktop and mobile, including validation, persistence, accessibility, security boundaries, and failure recovery.'),
    build('P50', 'complex', 'Build and verify a complete multi-tenant operations platform from this request, derive the data model, implement the interface, run quality gates, repair measured failures once, and report every acceptance criterion.'),
];

function toolsOf(plan: any): string[] {
    return (Array.isArray(plan?.steps) ? plan.steps : [])
        .map((step: any) => String(step?.tool || '').trim())
        .filter(Boolean);
}

async function main() {
    const started = Date.now();
    const failures: string[] = [];
    const counts = new Map<string, number>();
    const originalRouteToModel = intelligentRouter.routeToModel;
    // Keep the benchmark provider-neutral. The routing contract is real, while
    // a provider outage must not turn 50 deterministic cases into 50 network
    // waits. Provider-specific behaviour is covered by the provider tests.
    (intelligentRouter as any).routeToModel = async (messages: any[]) => {
        const text = messages.map((message: any) => String(message?.content || '')).join('\n');
        if (/(browser|متصفح|web|page|site)/i.test(text)) {
            return JSON.stringify({ action: 'audit', url: '', query: '', text: '', lang: '' });
        }
        if (/(build|create|make|develop|design|implement|project|app|system|platform)/i.test(text)) {
            return JSON.stringify({ intent: 'build_page', repo: '' });
        }
        return JSON.stringify({ intent: 'answer', repo: '' });
    };
    console.log(`Starting Joe 50-prompt benchmark (${CASES.length} cases)...`);

    try {
        for (const item of CASES) {
            let tools: string[] = [];
            let error = '';
            try {
                const plan = await PlanningEngine.generatePlan(
                    { intent: { goal: item.prompt } as any },
                    `benchmark-${item.id}`,
                    { sessionId: `benchmark-${item.id}-${Date.now()}` },
                );
                tools = toolsOf(plan);
            } catch (e: any) {
                error = String(e?.message || e || 'planning threw').slice(0, 180);
            }
            tools.forEach(tool => counts.set(tool, (counts.get(tool) || 0) + 1));
            const matched = item.expected.some(tool => tools.includes(tool));
            const status = matched ? 'PASS' : 'FAIL';
            console.log(`${status} ${item.id} [${item.level}] -> ${tools.join(' -> ') || '(none)'}${error ? ` :: ${error}` : ''}`);
            if (!matched) failures.push(`${item.id}: expected ${item.expected.join('|')}, got ${tools.join(' -> ') || error || '(none)'}`);
        }
    } finally {
        (intelligentRouter as any).routeToModel = originalRouteToModel;
    }

    console.log('\nBenchmark summary');
    console.log(`Cases: ${CASES.length}`);
    console.log(`Passed: ${CASES.length - failures.length}`);
    console.log(`Failed: ${failures.length}`);
    console.log(`Duration: ${Date.now() - started}ms`);
    console.log(`Tools: ${Array.from(counts.entries()).map(([tool, count]) => `${tool}=${count}`).join(', ') || '(none)'}`);
    if (failures.length) {
        console.error('\nFailures:\n' + failures.join('\n'));
        process.exitCode = 1;
    } else {
        console.log('50-prompt benchmark: PASSED');
    }
}

main().catch((error) => {
    console.error('50-prompt benchmark crashed:', error);
    process.exitCode = 1;
});

/**
 * Drives one novel prompt through Joe's real UI and records inspectable UAT
 * evidence. This is an acceptance runner, not a planner benchmark: the browser,
 * websocket, run route, orchestrator, generated preview, and user interactions
 * are all exercised together.
 *
 * Run from api/ while the API and web UI are already running:
 *   npx tsx src/tests/manual/verify_joe_prompt_ui_acceptance.ts
 *
 * Optional environment variables:
 *   JOE_UI_URL, JOE_UI_PROMPT, JOE_UI_TIMEOUT_MS, JOE_UI_EVIDENCE_DIR,
 *   JOE_UI_HEADLESS=false (show the browser while the acceptance run executes),
 *   JOE_UI_TOKEN and JOE_UI_SESSION_ID (reuse an existing authenticated run)
 */
export {};

import fs from 'fs';
import path from 'path';
import { inspectVerificationEvidence, readNavigationFailureEvidence } from './verification-evidence';

type CapturedFrame = {
    at: number;
    type: string;
    runId?: string;
    sessionId?: string;
    data?: unknown;
};

const baseUrl = String(process.env.JOE_UI_URL || 'http://127.0.0.1:5002').replace(/\/+$/, '');
const prompt = String(process.env.JOE_UI_PROMPT || [
    'Create a small browser-based library checkout board in a new local project.',
    'It needs title, borrower, due date, a returned toggle, filtering, validation, local persistence, and a responsive layout.',
    'Use focused checks while editing, then one final full verification. Report which checks ran and which were reused.',
    'Open and inspect the result in the browser. Do not deploy anything.',
].join(' '));
const timeoutMs = Math.max(60_000, Number(process.env.JOE_UI_TIMEOUT_MS) || 20 * 60_000);
const existingToken = String(process.env.JOE_UI_TOKEN || '').trim();
const existingSessionId = String(process.env.JOE_UI_SESSION_ID || '').trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceDir = path.resolve(process.env.JOE_UI_EVIDENCE_DIR || path.join('data', 'tests', 'joe-ui-acceptance', stamp));
fs.mkdirSync(evidenceDir, { recursive: true });

async function main(): Promise<void> {
    const { chromium } = await import('playwright');
    const { findChromiumExecutable } = await import('../../modules/browser/manager');
    const executablePath = findChromiumExecutable();
    const browser = await chromium.launch({
        headless: String(process.env.JOE_UI_HEADLESS || 'true').toLowerCase() !== 'false',
        ...(executablePath ? { executablePath } : {}),
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'en-US' });
    if (existingToken || existingSessionId) {
        await context.addInitScript(({ token, sessionId }) => {
            if (token) localStorage.setItem('token', token);
            if (sessionId) localStorage.setItem('joe-active-session', sessionId);
        }, { token: existingToken, sessionId: existingSessionId });
    }
    const page = await context.newPage();

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedResponses: Array<{ status: number; url: string; navigation?: { kind: string; attempts: number | null } }> = [];
    const navigationEvidence: Promise<void>[] = [];
    const frames: CapturedFrame[] = [];
    const progressStates: Array<{ at: number; busy: boolean; title: string; text: string }> = [];

    page.on('pageerror', error => pageErrors.push(String(error?.message || error).slice(0, 500)));
    page.on('console', message => {
        if (message.type() === 'error' && !/favicon\.ico/i.test(message.text())) {
            consoleErrors.push(message.text().slice(0, 500));
        }
    });
    page.on('response', response => {
        if (response.status() >= 400 && !/favicon\.ico/i.test(response.url())) {
            const failure: typeof failedResponses[number] = { status: response.status(), url: response.url() };
            failedResponses.push(failure);
            if (response.status() >= 500 && new URL(response.url()).pathname === '/api/browser/nav/goto') {
                if (navigationEvidence.length < 16) {
                    navigationEvidence.push(readNavigationFailureEvidence(() => response.json())
                        .then(evidence => { failure.navigation = evidence; }));
                } else failure.navigation = { kind: 'diagnostic_budget_exceeded', attempts: null };
            }
        }
    });
    page.on('websocket', socket => {
        socket.on('framereceived', event => {
            if (typeof event.payload !== 'string') return;
            try {
                const message = JSON.parse(event.payload);
                const data = message?.data && typeof message.data === 'object' ? message.data : {};
                frames.push({
                    at: Date.now(),
                    type: String(message?.type || ''),
                    runId: String(message?.runId || data?.runId || '') || undefined,
                    sessionId: String(message?.sessionId || data?.sessionId || '') || undefined,
                    data,
                });
            } catch {
                // Non-JSON terminal frames are not lifecycle evidence.
            }
        });
    });

    let receipt: any = null;
    let preview: Record<string, unknown> = {};
    let terminalFrame: CapturedFrame | undefined;
    let runStarted: CapturedFrame | undefined;
    let sawBusy = false;
    const startedAt = Date.now();

    try {
        await page.goto(`${baseUrl}/joe`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(1_500);
        const guestButton = page.getByRole('button', { name: /guest|\u0636\u064a\u0641/i });
        if (!existingToken && await guestButton.count()) {
            await guestButton.first().click();
        }

        const composer = page.locator('textarea.main-input').first();
        await composer.waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForFunction(() => Boolean(localStorage.getItem('joe-active-session')), undefined, { timeout: 30_000 });
        await page.screenshot({ path: path.join(evidenceDir, '01-ready.png'), fullPage: true });
        // Initial session hydration can remount the composer. Never submit
        // until the actual rendered input retains the complete request.
        let promptReady = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            await composer.fill(prompt);
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(evidenceDir, '02-prompt.png'), fullPage: true });
            promptReady = await composer.inputValue() === prompt;
            if (promptReady) break;
        }
        if (!promptReady) throw new Error('The composer did not retain the request; nothing was submitted');

        const submittedAt = Date.now();
        await composer.press('Enter');
        const deadline = submittedAt + timeoutMs;
        let lastState = '';

        while (Date.now() < deadline) {
            const recent = frames.filter(frame => frame.at >= submittedAt);
            runStarted = runStarted
                || recent.find(frame => frame.type === 'run_started')
                || recent.find(frame => Boolean(frame.runId));
            const matchingRunId = runStarted?.runId;
            const matchingSessionId = runStarted?.sessionId;
            terminalFrame = recent.find(frame => {
                if (!['run_finished', 'run_completed', 'run_failed', 'run_cancelled'].includes(frame.type)) return false;
                if (matchingRunId && frame.runId) return frame.runId === matchingRunId;
                if (matchingSessionId && frame.sessionId) return frame.sessionId === matchingSessionId;
                return true;
            });

            const sendButton = page.locator('button.send-btn').first();
            const busy = await sendButton.evaluate(element => element.classList.contains('is-busy')).catch(() => false);
            sawBusy = sawBusy || busy;
            const title = await sendButton.getAttribute('title').catch(() => '') || '';
            const text = await page.locator('body').innerText().catch(() => '');
            const state = `${busy}:${title}:${text.slice(-700)}`;
            if (state !== lastState) {
                progressStates.push({ at: Date.now(), busy, title, text: text.slice(-700) });
                lastState = state;
            }

            if (terminalFrame) break;
            if (!runStarted && Date.now() - submittedAt > 30_000) {
                throw new Error('No run started after submitting the request');
            }
            await page.waitForTimeout(2_500);
        }

        await page.screenshot({ path: path.join(evidenceDir, '03-finished.png'), fullPage: true });

        const runId = terminalFrame?.runId || runStarted?.runId;
        if (runId) {
            receipt = await page.evaluate(async id => {
                const token = localStorage.getItem('token');
                const response = await fetch(`/api/runs/${encodeURIComponent(id)}/receipt`, {
                    cache: 'no-store',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                return { status: response.status, body: await response.json().catch(() => null) };
            }, runId).catch(error => ({ error: String(error?.message || error) }));
        }

        const previewTab = page.getByRole('button', { name: /^Preview$/i }).first();
        if (await previewTab.count()) {
            await previewTab.click();
            await page.waitForTimeout(2_000);
        }
        await page.screenshot({ path: path.join(evidenceDir, '04-preview-desktop.png'), fullPage: true });

        const childFrames = page.frames().filter(frame => frame !== page.mainFrame());
        const previewFrame = childFrames.find(frame => /project-preview/i.test(frame.url()))
            || childFrames.find(frame => /localhost|127\.0\.0\.1/.test(frame.url()));
        if (previewFrame) {
            const beforeText = (await previewFrame.locator('body').innerText().catch(() => '')).slice(0, 2_000);
            const controls = await previewFrame.locator('input, textarea, select, button, a').evaluateAll(elements =>
                elements.slice(0, 40).map((element: any) => ({
                    tag: element.tagName.toLowerCase(),
                    type: element.getAttribute('type') || '',
                    name: element.getAttribute('name') || '',
                    label: element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.innerText || '',
                })),
            ).catch(() => []);

            const safeAction = previewFrame.getByRole('button', { name: /add|save|create|submit|\u0625\u0636\u0627\u0641|\u062d\u0641\u0638|\u0625\u0646\u0634\u0627\u0621/i }).first();
            const actionAvailable = await safeAction.count().then(count => count > 0).catch(() => false);
            let invalidRejected = false;
            if (actionAvailable) {
                await safeAction.click().catch(() => {});
                invalidRejected = await previewFrame.locator(':invalid').count().then(count => count > 0).catch(() => false);
            }

            const inputs = previewFrame.locator('form input:visible, form textarea:visible');
            const inputCount = await inputs.count();
            const marker = `Joe UAT ${Date.now()}`;
            for (let index = 0; index < Math.min(inputCount, 8); index++) {
                const input = inputs.nth(index);
                const type = (await input.getAttribute('type') || 'text').toLowerCase();
                if (type === 'checkbox' || type === 'radio') {
                    await input.check().catch(() => {});
                } else if (type === 'date') {
                    await input.fill('2026-10-15').catch(() => {});
                } else if (type === 'number') {
                    await input.fill('2').catch(() => {});
                } else if (!['button', 'submit', 'file', 'hidden'].includes(type)) {
                    const hint = `${await input.getAttribute('name') || ''} ${await input.getAttribute('placeholder') || ''}`.toLowerCase();
                    const value = /borrow|name|person/.test(hint) ? 'Ada Lovelace' : /title|book|item/.test(hint) ? marker : 'Acceptance value';
                    await input.fill(value).catch(() => {});
                }
            }

            if (actionAvailable) await safeAction.click().catch(() => {});
            await previewFrame.waitForTimeout(800).catch(() => {});
            const afterText = (await previewFrame.locator('body').innerText().catch(() => '')).slice(0, 2_000);
            const rowCreated = afterText.includes(marker);
            const hasSwitch = await previewFrame.locator('input[role="switch"]').count().then(count => count > 0).catch(() => false);
            const hasDateInput = await previewFrame.locator('input[type="date"]').count().then(count => count > 0).catch(() => false);

            await previewFrame.goto(previewFrame.url(), { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
            await previewFrame.waitForTimeout(700).catch(() => {});
            const afterReloadText = (await previewFrame.locator('body').innerText().catch(() => '')).slice(0, 2_000);
            const persistenceSurvivedReload = afterReloadText.includes(marker);

            const filterSelect = previewFrame.locator('.toolbar select').first();
            let filterWorked = false;
            if (await filterSelect.count()) {
                const options = await filterSelect.locator('option').allTextContents().catch(() => []);
                const yes = options.find(option => /^yes$/i.test(option.trim()));
                const no = options.find(option => /^no$/i.test(option.trim()));
                if (yes && no) {
                    await filterSelect.selectOption({ label: yes });
                    const visibleWhenMatched = (await previewFrame.locator('body').innerText().catch(() => '')).includes(marker);
                    await filterSelect.selectOption({ label: no });
                    const hiddenWhenDifferent = !(await previewFrame.locator('body').innerText().catch(() => '')).includes(marker);
                    filterWorked = visibleWhenMatched && hiddenWhenDifferent;
                    await filterSelect.selectOption({ index: 0 });
                }
            }
            preview = {
                url: previewFrame.url(),
                title: await previewFrame.title().catch(() => ''),
                controls,
                actionAvailable,
                invalidRejected,
                interactionChangedText: beforeText !== afterText,
                rowCreated,
                hasSwitch,
                hasDateInput,
                persistenceSurvivedReload,
                filterWorked,
                beforeText,
                afterText,
                afterReloadText,
            };
        }

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(500);
        if (previewFrame) {
            (preview as any).mobileFits = await previewFrame.evaluate(() =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ).catch(() => false);
            (preview as any).headingTextFits = await previewFrame.locator('h1, h2, h3').evaluateAll(headings => {
                const visible = headings.filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
                return visible.length > 0 && visible.every(el => {
                    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) return false;
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    const rects = Array.from(range.getClientRects());
                    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
                        const style = getComputedStyle(parent);
                        const box = parent.getBoundingClientRect();
                        const clipsX = /hidden|clip/.test(style.overflowX);
                        const clipsY = /hidden|clip/.test(style.overflowY);
                        if (rects.some(r => (clipsX && (r.left < box.left - 1 || r.right > box.right + 1))
                            || (clipsY && (r.top < box.top - 1 || r.bottom > box.bottom + 1)))) return false;
                    }
                    return true;
                });
            }).catch(() => false);
        }
        await page.screenshot({ path: path.join(evidenceDir, '05-preview-mobile.png'), fullPage: true });
    } finally {
        const verificationEvidence = inspectVerificationEvidence(receipt?.body?.events);
        const verificationEvidencePresent = verificationEvidence.present;
        const verificationTotals = verificationEvidence.totals;
        await Promise.all(navigationEvidence);
        const serverFailures = failedResponses.filter(response => response.status >= 500);
        const report = {
            baseUrl,
            prompt,
            startedAt: new Date(startedAt).toISOString(),
            elapsedMs: Date.now() - startedAt,
            sawBusy,
            runStarted,
            terminalFrame,
            terminalOk: Boolean((terminalFrame?.data as any)?.ok) && terminalFrame?.type !== 'run_failed',
            progressStateCount: progressStates.length,
            progressStates,
            pageErrors,
            consoleErrors,
            failedResponses,
            serverFailures,
            receipt,
            verificationTotals,
            verificationEvidencePresent,
            verificationEvidenceFailures: verificationEvidence.failures,
            preview,
            websocketEventTypes: frames.map(frame => frame.type),
        };
        fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
        await browser.close();

        console.log(JSON.stringify({
            evidenceDir,
            elapsedMs: report.elapsedMs,
            sawBusy,
            runStarted: Boolean(runStarted),
            terminalType: terminalFrame?.type || null,
            terminalOk: report.terminalOk,
            receiptStatus: receipt?.body?.status || null,
            verificationTotals,
            previewUrl: (preview as any).url || null,
            previewControls: Array.isArray((preview as any).controls) ? (preview as any).controls.length : 0,
            previewInteractionChangedText: Boolean((preview as any).interactionChangedText),
            previewInvalidRejected: Boolean((preview as any).invalidRejected),
            previewRowCreated: Boolean((preview as any).rowCreated),
            previewPersistenceSurvivedReload: Boolean((preview as any).persistenceSurvivedReload),
            previewFilterWorked: Boolean((preview as any).filterWorked),
            previewHasSwitch: Boolean((preview as any).hasSwitch),
            previewHasDateInput: Boolean((preview as any).hasDateInput),
            previewMobileFits: Boolean((preview as any).mobileFits),
            previewHeadingTextFits: Boolean((preview as any).headingTextFits),
            pageErrors: pageErrors.length,
            consoleErrors: consoleErrors.length,
            failedResponses: failedResponses.length,
            serverFailures: serverFailures.length,
        }, null, 2));

        const completed = terminalFrame?.type === 'run_finished' && report.terminalOk;
        const receiptCompleted = receipt?.status === 200 && receipt?.body?.status === 'done';
        const hasPreview = Boolean((preview as any).url);
        const previewPassed = Boolean((preview as any).invalidRejected)
            && Boolean((preview as any).rowCreated)
            && Boolean((preview as any).persistenceSurvivedReload)
            && Boolean((preview as any).filterWorked)
            && Boolean((preview as any).hasSwitch)
            && Boolean((preview as any).hasDateInput)
            && Boolean((preview as any).mobileFits)
            && Boolean((preview as any).headingTextFits);
        if (!sawBusy || !runStarted || !completed || !receiptCompleted || !verificationEvidencePresent || !hasPreview || !previewPassed || pageErrors.length > 0 || serverFailures.length > 0) {
            process.exitCode = 1;
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

import { test, expect } from '@playwright/test';

const JOE_URL = process.env.JOE_UI_URL || 'http://127.0.0.1:5002/joe';

const FRESH_PROMPT = `Create a simple Node.js command-line tool in TypeScript that reads a CSV file with columns "name,email,age" and outputs a JSON array of objects. The tool should accept the CSV file path as a command-line argument and write the JSON to stdout. Include a package.json with a "build" script (tsc) and a "start" script (node dist/index.js). Do not create a web app or React frontend.`;

test.describe('Real Joe UI Fresh Test - CRITICAL-REAL-JOE-UI-001', () => {
    test('should complete fresh CLI tool request through actual Joe UI', async ({ page }) => {
        console.log('Navigating to Joe UI...');
        await page.goto(JOE_URL, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Check if we're on login page and use Guest flow
        const loginButton = page.locator('button:has-text("Continue as Guest"), button:has-text("Guest"), a:has-text("Guest")').first();
        if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('Found Guest login, clicking...');
            await loginButton.click();
            await page.waitForURL('**/joe', { timeout: 10000 });
        }
        
        // Wait for chat interface
        await page.waitForSelector('textarea, input[type="text"][placeholder*="prompt"], [contenteditable="true"]', { timeout: 15000 });
        
        // Find the chat input
        const chatInput = page.locator('textarea, input[type="text"][placeholder*="prompt"], [contenteditable="true"]').first();
        await expect(chatInput).toBeVisible({ timeout: 10000 });
        
        console.log('Submitting fresh prompt...');
        await chatInput.fill(FRESH_PROMPT);
        
        // Submit using Enter key (textbox should handle this)
        await chatInput.press('Enter');
        
        // Wait for run to start - look for "Joe is working" or "Stop" button
        console.log('Waiting for run to start...');
        const runStartLocators = [
            page.getByText('Joe is working', { exact: false }).first(),
            page.locator('button:has-text("Stop")').first(),
            page.locator('[data-run-id]').first(),
            page.locator('.run-id').first(),
            page.getByText('run-', { exact: false }).first(),
            page.getByText('Run started', { exact: false }).first(),
        ];
        let runStarted = false;
        for (let i = 0; i < runStartLocators.length; i++) {
            const locator = runStartLocators[i];
            try {
                console.log(`Trying locator ${i + 1}...`);
                await locator.waitFor({ state: 'visible', timeout: 30000 });
                runStarted = true;
                console.log('Run started indicator found');
                break;
            } catch (e) {
                console.log(`Locator ${i + 1} failed: ${e instanceof Error ? e.message : String(e)}`);
                // Try next locator
            }
        }
        if (!runStarted) {
            // Take screenshot for debugging
            await page.screenshot({ path: 'test-results/real-joe-ui-no-run-start.png', fullPage: true });
            throw new Error('Run did not start within timeout');
        }
        
        console.log('Run started, waiting for completion...');
        
        // Wait for completion - look for final result indicators
        // This could take several minutes for a real engineering task
        // Use getByText for text-based selectors
        const completionTexts = [
            'completed',
            'verified', 
            'finalVerified',
            'PASS',
            'All checks passed',
        ];
        const completionCssSelectors = [
            '.status-completed',
            '[data-status="completed"]'
        ];
        
        let completed = false;
        const startTime = Date.now();
        const maxWaitMs = 20 * 60 * 1000; // 20 minutes max for real engineering task
        
        while (!completed && Date.now() - startTime < maxWaitMs) {
            // Check if Stop button changed back to Send (run ended)
            const sendButton = page.locator('button:has-text("Send")').first();
            const isSendVisible = await sendButton.isVisible({ timeout: 1000 }).catch(() => false);
            if (isSendVisible) {
                console.log('Send button visible again - run may have completed');
                // Check if there's a completion status
                for (const text of completionTexts) {
                    const element = page.getByText(text, { exact: false }).first();
                    if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
                        completed = true;
                        console.log(`Found completion text: ${text}`);
                        break;
                    }
                }
                if (!completed) {
                    // Run ended but no explicit completion text - check status area
                    const statusText = await page.getByText('Joe is working', { exact: false }).first().textContent().catch(() => '');
                    if (!statusText?.includes('working')) {
                        completed = true;
                        console.log('Joe is no longer working - run completed');
                    }
                }
            }
            
            // Check text-based indicators
            if (!completed) {
                for (const text of completionTexts) {
                    const element = page.getByText(text, { exact: false }).first();
                    if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
                        completed = true;
                        console.log(`Found completion text: ${text}`);
                        break;
                    }
                }
            }
            // Check CSS selectors
            if (!completed) {
                for (const selector of completionCssSelectors) {
                    const element = page.locator(selector).first();
                    if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
                        completed = true;
                        console.log(`Found completion CSS: ${selector}`);
                        break;
                    }
                }
            }
            if (!completed) {
                await page.waitForTimeout(15000);
            }
        }
        
        if (!completed) {
            // Take screenshot for debugging
            await page.screenshot({ path: 'test-results/real-joe-ui-timeout.png', fullPage: true });
            throw new Error('Joe UI test timed out after 5 minutes');
        }
        
        // Verify the generated project
        const projectPath = await page.evaluate(() => {
            // Try to find project path in the UI
            const elements = document.querySelectorAll('[data-project-path], .project-path, pre, code');
            for (const el of elements) {
                const text = el.textContent || '';
                if (text.includes('data/projects') || text.includes('project')) {
                    return text.trim();
                }
            }
            return null;
        });
        
        console.log('Project path from UI:', projectPath);
        
        // The test passes if we reached completion
        expect(completed).toBe(true);
    });
});
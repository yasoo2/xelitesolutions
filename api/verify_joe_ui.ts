
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function verifyJoeUI() {
    console.log('[Script] Starting manual visual verification...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const artifactDir = '/Users/younissowadi/.gemini/antigravity/brain/c82731cd-f3a3-4c86-9e1f-4c2ef40d982f';

    try {
        console.log('[Script] Navigating to Joe UI (127.0.0.1:5173)...');
        await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

        // Screenshot 1: UI Initial Load
        await page.screenshot({ path: path.join(artifactDir, 'joe_ui_initial_load.png') });
        console.log('[Script] Saved: joe_ui_initial_load.png');

        // Input Prompt
        console.log('[Script] Typing prompt...');
        const prompt = "Build a stunning modern luxury landing page for Elite AI Design with dark mode, glassmorphism, and smooth animations. Show me the code tab.";

        // Find input - usually a textarea or input inside the main chat
        const inputSelector = 'textarea, input[type="text"]';
        await page.fill(inputSelector, prompt);
        await page.keyboard.press('Enter');

        // Wait for Joe to start thinking
        console.log('[Script] Waiting for Joe to start thinking...');
        await page.waitForTimeout(10000);
        await page.screenshot({ path: path.join(artifactDir, 'joe_thinking_phase.png') });
        console.log('[Script] Saved: joe_thinking_phase.png');

        // Attempt to click 'Editor' or 'Code' tab if visible
        try {
            console.log('[Script] Attempting to find Editor/Code tab...');
            const tab = page.locator('button:has-text("Editor"), button:has-text("Code"), [role="tab"]:has-text("Code")');
            if (await tab.isVisible()) {
                await tab.click();
                console.log('[Script] Switched to Code tab.');
            }
        } catch (e) {
            console.log('[Script] Could not switch tabs, staying on current view.');
        }

        // Wait for coding progress
        console.log('[Script] Waiting for code generation...');
        await page.waitForTimeout(30000);
        await page.screenshot({ path: path.join(artifactDir, 'joe_writing_code.png') });
        console.log('[Script] Saved: joe_writing_code.png');

        // Final Preview check
        try {
            console.log('[Script] Attempting to find Preview/Browser tab...');
            const previewTab = page.locator('button:has-text("Preview"), button:has-text("Browser"), [role="tab"]:has-text("Preview")');
            if (await previewTab.isVisible()) {
                await previewTab.click();
                console.log('[Script] Switched to Preview tab.');
                await page.waitForTimeout(5000);
            }
        } catch (e) { }

        await page.screenshot({ path: path.join(artifactDir, 'joe_final_preview_ui.png') });
        console.log('[Script] Saved: joe_final_preview_ui.png');

        console.log('[Script] Verification finished successfully.');

    } catch (err) {
        console.error('[Script] Error during verification:', err);
        // Take error screenshot
        await page.screenshot({ path: path.join(artifactDir, 'joe_ui_error.png') });
    } finally {
        await browser.close();
    }
}

verifyJoeUI().catch(console.error);

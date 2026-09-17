import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { fileAppCss } from '../../modules/tools/definitions/react-app-templates';

async function main() {
    const directory = path.resolve('data/tests', `header-fit-${Date.now()}`);
    fs.mkdirSync(directory, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const results: unknown[] = [];
    try {
        const page = await browser.newPage();
        for (const width of [320, 390, 820, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            for (const [index, title] of [
                'Small Browser Based Library Checkout Board In A New Local Project',
                'AnUnbrokenApplicationNameThatMustRemainFullyReadableOnSmallScreensWithoutBeingClipped',
            ].entries()) {
                await page.setContent(`<style>${fileAppCss()}</style><div class="app"><header class="app-bar"><div class="app-bar-in"><div class="app-id"><h1 class="app-name"></h1><span class="app-sub">Workspace</span></div><button class="icon-btn" aria-label="Theme">T</button></div></header><main class="app-main">Project content</main></div>`);
                await page.locator('.app-name').evaluate((el, text) => { el.textContent = text; }, title);
                const fit = await page.locator('.app-name').evaluate(el => {
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    const parent = el.parentElement!.getBoundingClientRect();
                    const rectangles = Array.from(range.getClientRects());
                    const button = document.querySelector('button')!.getBoundingClientRect();
                    const box = el.getBoundingClientRect();
                    return {
                        width: innerWidth,
                        lines: rectangles.length,
                        parent: parent.toJSON(), box: box.toJSON(),
                        textRects: rectangles.map(r => r.toJSON()),
                        scroll: [el.scrollWidth, el.clientWidth, el.scrollHeight, el.clientHeight],
                        textFits: rectangles.every(r => r.left >= parent.left - 1 && r.right <= parent.right + 1
                            && r.top >= parent.top - 1 && r.bottom <= parent.bottom + 1),
                        noOverflow: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
                        noOverlap: box.right <= button.left || box.bottom <= button.top || box.top >= button.bottom,
                        documentFits: document.documentElement.scrollWidth <= innerWidth,
                    };
                });
                results.push({ title, ...fit });
                await page.screenshot({ path: path.join(directory, `${width}-${index}.png`) });
                assert(fit.textFits && fit.noOverflow && fit.noOverlap && fit.documentFits, JSON.stringify(fit));
            }
        }
    } finally {
        fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(results, null, 2));
        await browser.close();
    }
    console.log(`Passed ${results.length} generated-header browser cases. Evidence: ${directory}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });

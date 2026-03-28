
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { getBrowserSession, touchSession } from '../../browser/manager';
import { normalizeUrlForGoto } from '../../../shared/utils/url';
import { routeToModel } from '../../../core/llm/intelligent-router';
import fs from 'fs';
import path from 'path';

export class BrowserActionTool extends BaseTool {
    name = 'browser_action';
    description = 'Perform atomic browser actions (click, type, scroll, wait, eval) directly on a session.';
    version = '1.0.0';
    tags = ['browser', 'interaction', 'atomic'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            sessionId: { type: 'string' },
            action: { type: 'string', enum: ['click', 'click_coordinates', 'fill', 'scroll', 'scroll_to_element', 'wait', 'evaluate', 'goto', 'extract_text', 'get_elements', 'solve_visual_puzzle'] },
            selector: { type: 'string', description: 'CSS selector for the target element' },
            value: { type: 'string' },
            url: { type: 'string' },
            x: { type: 'number', description: 'X coordinate (pixels) for click_coordinates action' },
            y: { type: 'number', description: 'Y coordinate (pixels) for click_coordinates action' },
            puzzle_goal: { type: 'string', description: 'Description of the visual goal (e.g. "click all buses" or "solve this CAPTCHA")' }
        },
        required: ['sessionId', 'action']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' },
            result: { type: 'string' }
        }
    };
    permissions: ToolPermission[] = ['internet', 'execute'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        const sid = input.sessionId;
        const action = input.action;

        try {
            const session = await getBrowserSession(sid);
            touchSession(sid);
            const page = session.page;
            let result: any = null;

            if (action === 'goto') {
                if (!input.url) throw new Error('url required for goto');
                const url = normalizeUrlForGoto(input.url, page.url());

                // [Wakil 3.2] Port Validation Safeguard
                const { isPortOpen, isLocalOrInternalUrl } = await import('../../utils/network');
                if (isLocalOrInternalUrl(url)) {
                    try {
                        const u = new URL(url);
                        const port = parseInt(u.port) || (u.protocol === 'https:' ? 443 : 80);
                        const open = await isPortOpen(u.hostname, port);
                        if (!open) {
                            return {
                                ok: false,
                                error: `Navigation failed because no running web server was detected at ${u.hostname}:${port}. No URL was provided or discovered.`,
                                logs: [`port_check_failed=${u.hostname}:${port}`]
                            };
                        }
                    } catch (e) {
                        // If URL parsing fails, let page.goto handle it or fail gracefully
                    }
                }

                await page.goto(url, { waitUntil: 'domcontentloaded' });
                result = 'Navigated to ' + url;
            }
            else if (action === 'click') {
                if (!input.selector) throw new Error('selector required for click');
                await page.click(input.selector, { timeout: 5000 });
                result = 'Clicked ' + input.selector;
            }
            else if (action === 'fill') {
                if (!input.selector) throw new Error('selector required for fill');
                await page.fill(input.selector, String(input.value || ''));
                result = 'Filled ' + input.selector;
            }
            else if (action === 'scroll') {
                // Simple scroll down
                await page.evaluate(() => window.scrollBy(0, 500));
                result = 'Scrolled down';
            }
            else if (action === 'scroll_to_element') {
                if (!input.selector) throw new Error('selector required for scroll_to_element');
                await page.evaluate((sel: string) => {
                    const el = document.querySelector(sel);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, input.selector);
                result = 'Scrolled to ' + input.selector;
            }
            else if (action === 'click_coordinates') {
                const x = Number(input.x);
                const y = Number(input.y);
                if (isNaN(x) || isNaN(y)) throw new Error('x and y coordinates required for click_coordinates');
                await page.mouse.click(x, y);
                result = `Clicked at coordinates (${x}, ${y})`;
            }
            else if (action === 'wait') {
                const ms = Number(input.value || 1000);
                await page.waitForTimeout(ms);
                result = `Waited ${ms}ms`;
            }
            else if (action === 'evaluate') {
                result = await page.evaluate(input.value || '');
            }
            else if (action === 'extract_text') {
                // Extract visible text from the page or a specific element
                if (input.selector) {
                    result = await page.evaluate((sel: string) => {
                        const el = document.querySelector(sel);
                        return el ? el.textContent?.trim() || '' : 'Element not found';
                    }, input.selector);
                } else {
                    result = await page.evaluate(() => document.body.innerText?.substring(0, 5000) || '');
                }
            }
            else if (action === 'get_elements') {
                // Return interactive elements with their bounding boxes for coordinate-based clicking
                result = await page.evaluate(() => {
                    const interactiveSelectors = 'a, button, input, select, textarea, [role=button], [onclick], [tabindex]';
                    const elements = Array.from(document.querySelectorAll(interactiveSelectors));
                    return JSON.stringify(elements.slice(0, 50).map((el, i) => {
                        const rect = el.getBoundingClientRect();
                        return {
                            index: i,
                            tag: el.tagName.toLowerCase(),
                            text: (el.textContent || '').trim().substring(0, 80),
                            type: (el as HTMLInputElement).type || undefined,
                            href: (el as HTMLAnchorElement).href || undefined,
                            x: Math.round(rect.x + rect.width / 2),
                            y: Math.round(rect.y + rect.height / 2),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            visible: rect.width > 0 && rect.height > 0
                        };
                    }).filter(e => e.visible));
                });
            }
            else if (action === 'solve_visual_puzzle') {
                const goal = input.puzzle_goal || 'solve this visual puzzle';
                const screenshotPath = path.join(process.cwd(), `puzzle_${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath });

                const base64Image = fs.readFileSync(screenshotPath).toString('base64');
                const dataUrl = `data:image/png;base64,${base64Image}`;

                const prompt = `You are an expert at solving visual challenges and CAPTCHAs.
Analyze this screenshot and achieve the target goal: "${goal}".
Find the (x, y) center coordinates for each target object.
Return ONLY a JSON array of coordinate objects, like this: [{"x": 100, "y": 200}, {"x": 150, "y": 250}]
Do not return any text, just the JSON array.`;

                const responseText = await routeToModel(
                    [
                        { role: 'system', content: 'Return ONLY valid JSON array of coordinates. No markdown.' },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', image_url: { url: dataUrl } },
                            ],
                        },
                    ],
                    {
                        type: 'complex_reasoning',
                        complexity: 'high',
                        requiresTools: false,
                        estimatedTokens: 1000,
                        language: 'en',
                        hasImages: true
                    }
                );

                const jsonMatch = String(responseText || '').match(/\[[\s\S]*\]/);
                const coords: Array<{ x: number, y: number }> = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');

                for (const coord of coords) {
                    await page.mouse.click(coord.x, coord.y);
                    await page.waitForTimeout(400); // Natural delay
                }

                result = `Solved visual puzzle: clicked on ${coords.length} locations.`;
                // Cleanup
                try { fs.unlinkSync(screenshotPath); } catch { }
            }

            return { ok: true, output: { success: true, result: String(result) }, logs: [`action=${action}`] };

        } catch (e: any) {
            return { ok: false, error: e.message, logs: [`action_failed=${action}`] };
        }
    }
}

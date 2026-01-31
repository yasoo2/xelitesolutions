
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { getBrowserSession, touchSession } from '../../browser/manager';

export class BrowserActionTool extends BaseTool {
    name = 'browser_action';
    description = 'Perform atomic browser actions (click, type, scroll, wait, eval) directly on a session.';
    version = '1.0.0';
    tags = ['browser', 'interaction', 'atomic'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            sessionId: { type: 'string' },
            action: { type: 'string', enum: ['click', 'fill', 'scroll', 'wait', 'evaluate', 'goto'] },
            selector: { type: 'string' },
            value: { type: 'string' },
            url: { type: 'string' }
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
                let url = String(input.url || '').trim();
                while (url.length >= 2) {
                    const first = url[0];
                    const last = url[url.length - 1];
                    const wrap = (c: string) => c === '`' || c === '"' || c === "'" || c === '“' || c === '”';
                    if (wrap(first) && wrap(last)) url = url.slice(1, -1).trim();
                    else break;
                }
                url = url.replace(/[)\]`.,;:!?،؛؟]+$/g, '').trim();
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
            else if (action === 'wait') {
                const ms = Number(input.value || 1000);
                await page.waitForTimeout(ms);
                result = `Waited ${ms}ms`;
            }
            else if (action === 'evaluate') {
                result = await page.evaluate(input.value || '');
            }

            return { ok: true, output: { success: true, result: String(result) }, logs: [`action=${action}`] };

        } catch (e: any) {
            return { ok: false, error: e.message, logs: [`action_failed=${action}`] };
        }
    }
}

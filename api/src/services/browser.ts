import puppeteer, { Browser, Page, ConsoleMessage, HTTPRequest, HTTPResponse } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';
import { broadcast } from '../ws';

interface LogEntry {
    type: 'log' | 'error' | 'warn' | 'info';
    message: string;
    timestamp: number;
    stackTrace?: string; // Extracted file path if possible
}

interface NetworkEntry {
    url: string;
    method: string;
    status?: number;
    type: string;
    timestamp: number;
    requestBody?: string;
    responseBody?: string;
}

interface AuditReport {
    score: number;
    issues: {
        severity: 'critical' | 'warning' | 'info';
        message: string;
        selector?: string;
    }[];
}

class BrowserService {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private logs: LogEntry[] = [];
    private network: NetworkEntry[] = [];

    private async getExecutablePath(): Promise<string | undefined> {
        // 1. Try Puppeteer's default resolution
        try {
            const defaultPath = puppeteer.executablePath();
            try {
                await fs.promises.access(defaultPath);
                console.info('Using default Puppeteer executable:', defaultPath);
                return defaultPath;
            } catch {}
        } catch (e) {
            console.warn('Puppeteer executablePath() failed:', e);
        }

        // 2. Search in common cache locations and local .chrome-bin
        const searchPaths = [
            path.join(process.cwd(), '.chrome-bin'),           // Explicit local install
            path.join(process.cwd(), 'api', '.chrome-bin'),    // If running from root
            path.join(process.cwd(), '.cache', 'puppeteer'),
            path.join(process.cwd(), 'api', '.cache', 'puppeteer'),
            path.join(__dirname, '../../.cache', 'puppeteer'),
            path.join(__dirname, '../../../.cache', 'puppeteer'),
        ];

        console.log('Searching for Chrome in:', searchPaths);

        for (const basePath of searchPaths) {
            try {
                await fs.promises.access(basePath);
            } catch { continue; }
            
            // Find chrome binary (recursively)
            // Look for "Google Chrome for Testing" (Mac) or "chrome" (Linux)
            const pattern = '**/{Google Chrome for Testing,chrome,chrome.exe}';
            const matches = await glob(pattern, { cwd: basePath, absolute: true });
            
            // Filter for actual executables
            for (const match of matches) {
                 try {
                     const stat = await fs.promises.stat(match);
                     // Relaxed check: just needs to be a file
                     if (stat.isFile()) {
                         // console.log('Found executable manually:', match);
                         return match;
                     }
                 } catch (e) {}
            }
        }

        // 3. Fallback: Check for standard Linux path structure explicitly if glob failed
        const linuxPath = path.join(process.cwd(), 'api/.cache/puppeteer/chrome'); 
        try {
            await fs.promises.access(linuxPath);
             // Try to find 'chrome' binary under it
             try {
                 const files = await glob('**/chrome', { cwd: linuxPath, absolute: true });
                 if (files.length > 0) return files[0];
             } catch(e) {}
        } catch {}

        return undefined;
    }

    async launch() {
        if (this.browser) return;
        
        try {
            const executablePath = await this.getExecutablePath();
            console.info('Launching browser with executable path:', executablePath || 'bundled');

            this.browser = await puppeteer.launch({
                headless: true,
                ignoreHTTPSErrors: true,
                executablePath, // If undefined, puppeteer tries its best
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process', 
                ]
            } as any);
            
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1280, height: 800 });

            // Setup listeners
            this.setupListeners();
        } catch (error) {
            console.error('Failed to launch browser:', error);
            // Log full error details for debugging
            if (error instanceof Error) {
                console.error('Error stack:', error.stack);
            }
            throw error;
        }
    }

    private setupListeners() {
        if (!this.page) return;

        this.page.on('console', (msg: ConsoleMessage) => {
            const text = msg.text();
            let stackTrace = undefined;
            
            // Heuristic to find file paths in error messages
            const match = text.match(/(?:at\s+|@)([\w/.-]+:\d+:\d+)/);
            if (match) {
                stackTrace = match[1];
            }

            this.logs.push({
                type: msg.type() as any,
                message: text,
                timestamp: Date.now(),
                stackTrace
            });
            // Keep only last 1000 logs
            if (this.logs.length > 1000) this.logs.shift();
        });

        this.page.on('request', (req: HTTPRequest) => {
            // Optional: capture pending requests if needed
        });

        this.page.on('response', async (resp: HTTPResponse) => {
            let responseBody = undefined;
            let requestBody = resp.request().postData();

            try {
                // Only fetch body for text/json to avoid huge binaries
                const contentType = resp.headers()['content-type'] || '';
                if (contentType.includes('application/json') || contentType.includes('text/')) {
                     // Check size before fetching to avoid OOM
                     const length = Number(resp.headers()['content-length']);
                     if (!length || length < 1024 * 1024) { // 1MB limit
                         responseBody = await resp.text();
                     } else {
                         responseBody = '[Body too large]';
                     }
                }
            } catch (e) {
                responseBody = '[Failed to read body]';
            }

            this.network.push({
                url: resp.url(),
                method: resp.request().method(),
                status: resp.status(),
                type: resp.request().resourceType(),
                timestamp: Date.now(),
                requestBody,
                responseBody
            });
            if (this.network.length > 1000) this.network.shift();
        });
    }

    async auditPage(): Promise<AuditReport | null> {
        if (!this.page) return null;
        
        return await this.page.evaluate(() => {
            const issues: any[] = [];
            let score = 100;

            // 1. Check Images Alt Text
            const images = document.querySelectorAll('img');
            images.forEach(img => {
                if (!img.alt) {
                    score -= 2;
                    issues.push({
                        severity: 'warning',
                        message: 'Image missing alt text',
                        selector: img.id ? `#${img.id}` : (img.className ? `.${img.className.split(' ')[0]}` : 'img')
                    });
                }
            });

            // 2. Check Tap Targets (Buttons)
            const buttons = document.querySelectorAll('button, a');
            buttons.forEach(btn => {
                const rect = btn.getBoundingClientRect();
                if (rect.width > 0 && (rect.width < 44 || rect.height < 44)) {
                     score -= 1;
                     issues.push({
                        severity: 'info',
                        message: 'Touch target too small (<44px)',
                        selector: btn.textContent?.slice(0, 20) || 'button'
                     });
                }
            });

            // 3. Check Input Labels
            const inputs = document.querySelectorAll('input');
            inputs.forEach(input => {
                if (input.type === 'hidden' || input.type === 'submit') return;
                const hasLabel = input.labels && input.labels.length > 0;
                const hasAria = input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby');
                if (!hasLabel && !hasAria) {
                    score -= 5;
                    issues.push({
                        severity: 'critical',
                        message: 'Input field missing label',
                        selector: input.name || input.id || 'input'
                    });
                }
            });

            // 4. Check Headings Hierarchy
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
            let lastLevel = 0;
            headings.forEach(h => {
                const level = parseInt(h.tagName[1]);
                if (level > lastLevel + 1) {
                    score -= 3;
                    issues.push({
                        severity: 'warning',
                        message: `Skipped heading level: H${lastLevel} to H${level}`,
                        selector: h.textContent?.slice(0, 20) || `H${level}`
                    });
                }
                lastLevel = level;
            });

            return {
                score: Math.max(0, score),
                issues
            };
        });
    }

    async navigate(url: string) {
        if (!this.page) await this.launch();
        if (!url.startsWith('http')) url = 'https://' + url;
        
        broadcast({ type: 'browser:nav', data: { url } });
        
        await this.page!.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        broadcast({ type: 'browser:nav', data: { url: this.page!.url(), title: await this.page!.title() } });
        
        return { title: await this.page!.title(), url: this.page!.url() };
    }

    async screenshot() {
        if (!this.page) return null;
        try {
            return await this.page.screenshot({ encoding: 'base64' });
        } catch (error) {
            console.error('Screenshot failed:', error);
            // If screenshot fails, browser might be dead. Try to restart.
            try {
                await this.close();
                await this.launch();
            } catch (restartError) {
                console.error('Failed to restart browser after screenshot failure:', restartError);
            }
            return null;
        }
    }

    async pdf() {
        if (!this.page) return null;
        return await this.page.pdf({ format: 'A4' });
    }

    async setViewport(width: number, height: number) {
        if (!this.page) return;
        await this.page.setViewport({ width, height });
    }

    async evaluate(script: string) {
        if (!this.page) return null;
        try {
            const result = await this.page.evaluate((code: string) => {
                try {
                    // eslint-disable-next-line no-eval
                    return eval(code);
                } catch (e: any) {
                    return e.toString();
                }
            }, script);
            return result;
        } catch (e: any) {
            return e.message;
        }
    }

    async inspect(x: number, y: number) {
        if (!this.page) return null;
        return await this.page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            if (!el) return null;
            
            const styles = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            
            return {
                tagName: el.tagName.toLowerCase(),
                id: el.id,
                className: el.className,
                innerHTML: el.innerHTML.slice(0, 200) + (el.innerHTML.length > 200 ? '...' : ''),
                innerText: (el as HTMLElement).innerText?.slice(0, 100),
                rect: {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left
                },
                styles: {
                    color: styles.color,
                    backgroundColor: styles.backgroundColor,
                    fontFamily: styles.fontFamily,
                    fontSize: styles.fontSize,
                    display: styles.display,
                    padding: styles.padding,
                    margin: styles.margin
                }
            };
        }, { x, y });
    }

    async moveMouse(x: number, y: number) {
        if (!this.page) return;
        
        // Broadcast start of movement
        broadcast({ type: 'browser:cursor', data: { x, y, type: 'move' } });
        
        // Use steps for smooth movement (Puppeteer already handles this nicely if we ask it to)
        // But we want to broadcast intermediate steps for the frontend if possible?
        // Puppeteer's mouse.move with steps blocks until done. 
        // We can just trust the frontend to animate the transition between current and target.
        await this.page.mouse.move(x, y, { steps: 25 });
    }

    async click(x: number, y: number) {
        if (!this.page) return;
        
        // Move first
        await this.moveMouse(x, y);
        
        broadcast({ type: 'browser:cursor', data: { x, y, type: 'click' } });
        await this.page.mouse.down();
        await new Promise(r => setTimeout(r, 100));
        await this.page.mouse.up();
    }

    async clickSelector(selector: string) {
        if (!this.page) return;
        try {
            await this.page.waitForSelector(selector, { timeout: 5000 });
            const el = await this.page.$(selector);
            if (el) {
                const box = await el.boundingBox();
                if (box) {
                    const x = box.x + box.width / 2;
                    const y = box.y + box.height / 2;
                    await this.click(x, y);
                    return;
                }
            }
            // Fallback if no box (shouldn't happen for visible elements)
            await this.page.click(selector);
        } catch (e: any) {
            throw new Error(`Failed to click selector "${selector}": ${e.message}`);
        }
    }

    async type(text: string) {
        if (!this.page) return;
        
        broadcast({ type: 'browser:cursor', data: { type: 'type', text } });
        
        // Type slower to feel human
        await this.page.keyboard.type(text, { delay: 50 });
    }

    async typeSelector(selector: string, text: string) {
        if (!this.page) return;
        try {
            await this.page.waitForSelector(selector, { timeout: 5000 });
            
            // Click to focus first
            const el = await this.page.$(selector);
            if (el) {
                const box = await el.boundingBox();
                if (box) {
                    await this.click(box.x + box.width / 2, box.y + box.height / 2);
                } else {
                    await this.page.click(selector);
                }
            }

            // Clear existing text?
            await this.page.evaluate((sel) => {
                const e = document.querySelector(sel) as HTMLInputElement;
                if (e) e.value = '';
            }, selector);

            await this.type(text);
        } catch (e: any) {
            throw new Error(`Failed to type in selector "${selector}": ${e.message}`);
        }
    }

    async getSimplifiedDOM() {
        if (!this.page) return null;
        return await this.page.evaluate(() => {
            const cleanup = (node: any) => {
                const importantTags = ['a', 'button', 'input', 'select', 'textarea', 'h1', 'h2', 'h3', 'p', 'div', 'span', 'img', 'form'];
                const tag = node.tagName.toLowerCase();
                
                if (!importantTags.includes(tag)) return null;
                
                const rect = node.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return null; // Invisible

                const attributes: any = {};
                if (node.id) attributes.id = node.id;
                if (node.name) attributes.name = node.name;
                if (node.href) attributes.href = node.href;
                if (node.placeholder) attributes.placeholder = node.placeholder;
                if (node.type) attributes.type = node.type;
                if (node.className) attributes.class = node.className;
                
                let text = '';
                // Only get direct text content or important child text
                if (['p', 'span', 'h1', 'h2', 'h3', 'button', 'a'].includes(tag)) {
                    text = node.innerText.slice(0, 200);
                }

                return {
                    tag,
                    ...attributes,
                    text: text || undefined,
                    // rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
                };
            };

            const traverse = (node: Element): any[] => {
                const children = Array.from(node.children).map(traverse).flat().filter(Boolean);
                const info = cleanup(node);
                if (info) {
                    // if it has children, maybe we don't need to return them nested if we want a flat list?
                    // actually, a flat list of interactive elements is better for AI
                    return [info, ...children];
                }
                return children;
            };

            return traverse(document.body);
        });
    }

    async scroll(deltaY: number) {
        if (!this.page) return;
        await this.page.evaluate((dy: number) => {
            window.scrollBy(0, dy);
        }, deltaY);
    }

    async goBack() {
        if (this.page) await this.page.goBack();
    }

    async goForward() {
        if (this.page) await this.page.goForward();
    }

    async reload() {
        if (this.page) await this.page.reload();
    }

    getLogs() {
        return this.logs;
    }

    getNetwork() {
        return this.network;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.logs = [];
            this.network = [];
        }
    }

    getStatus() {
        const viewport = this.page?.viewport();
        return {
            active: !!this.browser,
            url: this.page?.url() || '',
            viewport: viewport || { width: 1280, height: 800 }
        };
    }
}

export const browserService = new BrowserService();

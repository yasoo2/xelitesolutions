import puppeteer, { Browser, Page } from 'puppeteer';

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

    async launch() {
        if (this.browser) return;
        
        try {
            this.browser = await puppeteer.launch({
                headless: true,
                ignoreHTTPSErrors: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process', 
                ]
            });
            
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

        this.page.on('console', msg => {
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

        this.page.on('request', req => {
            // Optional: capture pending requests if needed
        });

        this.page.on('response', async resp => {
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
        await this.page!.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
            const result = await this.page.evaluate((code) => {
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

    async click(x: number, y: number) {
        if (!this.page) return;
        await this.page.mouse.click(x, y);
    }

    async clickSelector(selector: string) {
        if (!this.page) return;
        try {
            await this.page.waitForSelector(selector, { timeout: 5000 });
            await this.page.click(selector);
        } catch (e: any) {
            throw new Error(`Failed to click selector "${selector}": ${e.message}`);
        }
    }

    async type(text: string) {
        if (!this.page) return;
        await this.page.keyboard.type(text);
    }

    async typeSelector(selector: string, text: string) {
        if (!this.page) return;
        try {
            await this.page.waitForSelector(selector, { timeout: 5000 });
            await this.page.type(selector, text);
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
        await this.page.evaluate((dy) => {
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
        return {
            active: !!this.browser,
            url: this.page?.url() || '',
            title: '' // async, skip for sync status
        };
    }
}

export const browserService = new BrowserService();

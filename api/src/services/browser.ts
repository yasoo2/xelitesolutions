import puppeteer, { Browser, Page } from 'puppeteer';

interface LogEntry {
    type: 'log' | 'error' | 'warn' | 'info';
    message: string;
    timestamp: number;
}

interface NetworkEntry {
    url: string;
    method: string;
    status?: number;
    type: string;
    timestamp: number;
}

class BrowserService {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private logs: LogEntry[] = [];
    private network: NetworkEntry[] = [];

    async launch() {
        if (this.browser) return;
        
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1280, height: 800 });

        // Setup listeners
        this.page.on('console', msg => {
            this.logs.push({
                type: msg.type() as any,
                message: msg.text(),
                timestamp: Date.now()
            });
            // Keep only last 1000 logs
            if (this.logs.length > 1000) this.logs.shift();
        });

        this.page.on('request', req => {
            // we don't need to store pending requests for this simple view, 
            // but we could tracking them if needed. 
            // For now, just tracking completed responses might be enough, 
            // but to show "live" activity, requests are good too.
        });

        this.page.on('response', resp => {
            this.network.push({
                url: resp.url(),
                method: resp.request().method(),
                status: resp.status(),
                type: resp.request().resourceType(),
                timestamp: Date.now()
            });
            if (this.network.length > 1000) this.network.shift();
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
        return await this.page.screenshot({ encoding: 'base64' });
    }

    async pdf() {
        if (!this.page) return null;
        return await this.page.pdf({ format: 'A4' });
    }

    async click(x: number, y: number) {
        if (!this.page) return;
        await this.page.mouse.click(x, y);
    }

    async type(text: string) {
        if (!this.page) return;
        await this.page.keyboard.type(text);
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

/**
 * Advanced Browser Intelligence
 * Smart page understanding, automatic interaction, and vision capabilities
 */

export interface PageAnalysis {
    url: string;
    title: string;
    pageType: 'form' | 'article' | 'ecommerce' | 'social' | 'search' | 'dashboard' | 'unknown';
    interactiveElements: InteractiveElement[];
    forms: FormElement[];
    articles: ArticleContent[];
    dataExtracts: Record<string, any>;
    screenshot?: string; // Base64 or path
}

export interface InteractiveElement {
    type: 'button' | 'link' | 'input' | 'select' | 'textarea';
    label: string;
    selector: string;
    purpose?: string; // Inferred purpose
    importance: number; // 0-1
}

export interface FormElement {
    action: string;
    method: string;
    fields: Array<{
        name: string;
        type: string;
        label?: string;
        required: boolean;
        placeholder?: string;
    }>;
    submitButton?: string;
}

export interface ArticleContent {
    title: string;
    author?: string;
    date?: string;
    content: string;
    summary?: string;
}

/**
 * Analyze page structure and content
 */
export function analyzePage(html: string, url: string): PageAnalysis {
    // This will be enhanced with actual DOM parsing
    const analysis: PageAnalysis = {
        url,
        title: extractTitle(html),
        pageType: detectPageType(html),
        interactiveElements: extractInteractiveElements(html),
        forms: extractForms(html),
        articles: extractArticles(html),
        dataExtracts: {}
    };

    return analysis;
}

function extractTitle(html: string): string {
    const match = html.match(/<title>(.*?)<\/title>/i);
    return match ? match[1] : 'Untitled';
}

function detectPageType(html: string): PageAnalysis['pageType'] {
    const lower = html.toLowerCase();

    if (/<form/i.test(lower) && (lower.includes('login') || lower.includes('signup') || lower.includes('register'))) {
        return 'form';
    }

    if (/<article/i.test(lower) || /<div[^>]*class="[^"]*article[^"]*"/i.test(lower)) {
        return 'article';
    }

    if (/\b(cart|checkout|product|price|buy|shop)\b/i.test(lower)) {
        return 'ecommerce';
    }

    if (/\b(tweet|post|feed|comment|like|share)\b/i.test(lower)) {
        return 'social';
    }

    if (/<input[^>]*type="search"/i.test(lower) || lower.includes('google.com')) {
        return 'search';
    }

    if (/\b(dashboard|admin|panel|analytics)\b/i.test(lower)) {
        return 'dashboard';
    }

    return 'unknown';
}

function extractInteractiveElements(html: string): InteractiveElement[] {
    const elements: InteractiveElement[] = [];

    // Extract buttons
    const buttonRegex = /<button[^>]*>(.*?)<\/button>/gi;
    let match;
    while ((match = buttonRegex.exec(html)) !== null) {
        const text = match[1].replace(/<[^>]+>/g, '').trim();
        if (text) {
            elements.push({
                type: 'button',
                label: text,
                selector: `button:contains("${text}")`,
                importance: calculateImportance(text)
            });
        }
    }

    // Extract links
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const text = match[2].replace(/<[^>]+>/g, '').trim();
        if (text && !href.startsWith('#')) {
            elements.push({
                type: 'link',
                label: text,
                selector: `a[href="${href}"]`,
                importance: 0.5
            });
        }
    }

    // Extract inputs
    const attr = (tag: string, key: string) => {
        const m = tag.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i'));
        return m?.[1];
    };
    const inputTagRegex = /<input\b[^>]*>/gi;
    while ((match = inputTagRegex.exec(html)) !== null) {
        const tag = match[0];
        const type = (attr(tag, 'type') || 'text').toLowerCase();
        const placeholder = attr(tag, 'placeholder') || '';
        const name = attr(tag, 'name') || '';

        const selectorParts = [`input[type="${type}"]`];
        if (name) selectorParts.push(`[name="${name}"]`);
        else if (placeholder) selectorParts.push(`[placeholder="${placeholder}"]`);

        elements.push({
            type: 'input',
            label: placeholder || name || type,
            selector: selectorParts.join(''),
            importance: type === 'submit' ? 0.9 : 0.6
        });
    }

    return elements.slice(0, 20); // Limit to top 20
}

function extractForms(html: string): FormElement[] {
    const forms: FormElement[] = [];
    const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;

    let match;
    while ((match = formRegex.exec(html)) !== null) {
        const formAttrs = match[1] || '';
        const formContent = match[2];
        const action = (formAttrs.match(/\baction\s*=\s*"([^"]*)"/i)?.[1] || '').trim();
        const method = (formAttrs.match(/\bmethod\s*=\s*"([^"]*)"/i)?.[1] || 'GET').trim();

        const fields = extractFormFields(formContent);

        forms.push({
            action,
            method,
            fields
        });
    }

    return forms;
}

function extractFormFields(formHtml: string): FormElement['fields'] {
    const fields: FormElement['fields'] = [];
    const inputRegex = /<input\b[^>]*>/gi;

    let match;
    while ((match = inputRegex.exec(formHtml)) !== null) {
        const tag = match[0];
        const name = tag.match(/\bname\s*=\s*"([^"]*)"/i)?.[1] || '';
        const type = (tag.match(/\btype\s*=\s*"([^"]*)"/i)?.[1] || 'text').toLowerCase();
        const placeholder = tag.match(/\bplaceholder\s*=\s*"([^"]*)"/i)?.[1];

        fields.push({
            name,
            type,
            required: /\brequired\b/i.test(tag),
            placeholder
        });
    }

    return fields;
}

function extractArticles(html: string): ArticleContent[] {
    // Simplified article extraction
    const articles: ArticleContent[] = [];

    const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let match;

    while ((match = articleRegex.exec(html)) !== null) {
        const content = match[1];
        const title = content.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i)?.[1] || 'Untitled';
        const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        articles.push({
            title,
            content: text.substring(0, 1000),
            summary: text.substring(0, 200) + '...'
        });
    }

    return articles;
}

function calculateImportance(text: string): number {
    const lower = text.toLowerCase();

    // High importance keywords
    if (/\b(submit|send|buy|purchase|login|signup|register|confirm|save|cliquez|envoyer)\b/i.test(lower)) {
        return 0.9;
    }

    // Medium  importance
    if (/\b(search|next|continue|cancel|back|close)\b/i.test(lower)) {
        return 0.6;
    }

    return 0.4;
}

/**
 * Smart interaction planner
 */
export function planInteraction(goal: string, pageAnalysis: PageAnalysis): string[] {
    const steps: string[] = [];
    const lower = goal.toLowerCase();

    // Login flow
    if (/\b(login|log in|sign in|تسجيل\s*دخول)\b/i.test(lower)) {
        const usernameField = pageAnalysis.interactiveElements.find(e =>
            e.type === 'input' && /\b(user|email|username)\b/i.test(e.label)
        );
        const passwordField = pageAnalysis.interactiveElements.find(e =>
            e.type === 'input' && /\b(pass|password)\b/i.test(e.label)
        );
        const submitButton = pageAnalysis.interactiveElements.find(e =>
            e.type === 'button' && /\b(login|submit|sign\s*in)\b/i.test(e.label)
        );

        if (usernameField) steps.push(`Type username in ${usernameField.selector}`);
        if (passwordField) steps.push(`Type password in ${passwordField.selector}`);
        if (submitButton) steps.push(`Click ${submitButton.selector}`);
    }

    // Search flow
    else if (/\b(search|بحث|find|ابحث)\b/i.test(lower)) {
        const searchInput = pageAnalysis.interactiveElements.find(e =>
            e.type === 'input' && (/search/i.test(e.label) || e.label.includes('q'))
        );

        if (searchInput) {
            steps.push(`Type search query in ${searchInput.selector}`);
            steps.push(`Press Enter or click search button`);
        }
    }

    // Form filling
    else if (/\b(fill|املأ|complete|اكمل)\b/i.test(lower) && pageAnalysis.forms.length > 0) {
        const form = pageAnalysis.forms[0];
        for (const field of form.fields) {
            steps.push(`Fill ${field.name} (${field.type})`);
        }
        if (form.submitButton) {
            steps.push(`Click submit button`);
        }
    }

    // Navigation
    else if (/\b(go to|navigate|click|انقر|اذهب)\b/i.test(lower)) {
        const targetText = lower.match(/(?:go to|navigate to|click|انقر|اذهب)\s+(.+)/i)?.[1] || '';
        const element = pageAnalysis.interactiveElements.find(e =>
            e.label.toLowerCase().includes(targetText)
        );

        if (element) {
            steps.push(`Click ${element.selector}`);
        }
    }

    if (steps.length === 0) {
        steps.push('Unable to plan interaction - please provide more specific instructions');
    }

    return steps;
}

/**
 * Extract data from page based on schema
 */
export function extractData(html: string, schema: Record<string, string>): Record<string, any> {
    const data: Record<string, any> = {};

    for (const [key, selector] of Object.entries(schema)) {
        // Simple extraction (will be enhanced with actual DOM)
        const regex = new RegExp(`<[^>]*${selector}[^>]*>([^<]+)<`, 'i');
        const match = html.match(regex);
        data[key] = match ? match[1].trim() : null;
    }

    return data;
}

export default {
    analyzePage,
    planInteraction,
    extractData
};

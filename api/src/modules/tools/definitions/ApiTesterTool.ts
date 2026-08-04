import { ToolDefinition, ToolPermission } from '../types';

export class ApiTesterTool implements ToolDefinition {
    name = 'api_tester';
    version = '1.0.0';
    tags = ['network', 'api', 'testing', 'http'];
    description = 'Test APIs robustly like Postman. Supports custom Headers, JSON bodies, Authentication, and dynamic methods.';

    inputSchema: any = {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'Full URL of the API endpoint to test' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], description: 'HTTP method' },
            headers: { type: 'object', description: 'Key-value pairs for headers (e.g. { "Authorization": "Bearer token" })' },
            body: { type: 'string', description: 'JSON stringified body data for POST/PUT/PATCH requests' }
        },
        required: ['url', 'method']
    };

    outputSchema: any = {
        type: 'object',
        properties: {
            status: { type: 'number' },
            statusText: { type: 'string' },
            headers: { type: 'object' },
            data: { type: 'string' },
            timeMs: { type: 'number' }
        }
    };

    permissions: ToolPermission[] = ['execute', 'read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;
    auditFields = ['url', 'method'];
    mockSupported = false;

    async execute(input: { url: string; method: string; headers?: Record<string, string>; body?: string }) {
        const startTime = Date.now();
        // With no url this called fetch(undefined) — a request to the string
        // "undefined", reported back as a network failure instead of a missing
        // argument.
        const url = String(input?.url ?? '').trim();
        if (!url) return { ok: false, error: 'api_tester needs a url to call.', logs: [] };
        if (!/^https?:\/\//i.test(url)) {
            return { ok: false, error: `api_tester needs an http(s) url — got "${url.slice(0, 60)}".`, logs: [] };
        }
        input = { ...input, url, method: String(input?.method || 'GET').toUpperCase() };
        const logs: string[] = [`Starting ${input.method} request to ${input.url}`];

        try {
            const options: RequestInit = {
                method: input.method,
                headers: input.headers || {}
            };

            if (input.body && ['POST', 'PUT', 'PATCH'].includes(input.method)) {
                // Determine if body is JSON to automatically set content-type if not present
                try {
                    JSON.parse(input.body);
                    if (!options.headers) options.headers = {};
                    if (!(options.headers as any)['Content-Type']) {
                        (options.headers as any)['Content-Type'] = 'application/json';
                    }
                } catch { /* not json */ }
                options.body = input.body;
            }

            const response = await fetch(input.url, options);
            const timeMs = Date.now() - startTime;
            
            logs.push(`Response: ${response.status} ${response.statusText} in ${timeMs}ms`);

            let responseData = '';
            const contentType = response.headers.get('content-type') || '';
            
            if (contentType.includes('application/json')) {
                const json = await response.json();
                responseData = JSON.stringify(json, null, 2);
            } else {
                responseData = await response.text();
            }

            const resHeaders: any = {};
            response.headers.forEach((value, key) => { resHeaders[key] = value; });

            return {
                ok: response.ok,
                output: {
                    status: response.status,
                    statusText: response.statusText,
                    headers: resHeaders,
                    data: responseData,
                    timeMs
                },
                logs
            };
        } catch (e: any) {
            logs.push(`Network Error: ${e.message}`);
            return {
                ok: false,
                error: e.message,
                output: null,
                logs
            };
        }
    }
}

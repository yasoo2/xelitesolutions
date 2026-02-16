import { API_URL } from '../config';

class ApiClient {
    private apiBaseUrl() {
        const raw = String(API_URL || '').trim();
        if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
        const p = raw.startsWith('/') ? raw : `/${raw}`;
        return `${window.location.origin}${p}`.replace(/\/+$/, '');
    }

    private buildUrl(endpoint: string) {
        const ep = String(endpoint || '').trim();
        const path = ep.startsWith('/') ? ep : `/${ep}`;
        return `${this.apiBaseUrl()}${path}`;
    }

    private get token() {
        try {
            return localStorage.getItem('token');
        } catch {
            return null;
        }
    }

    private get headers() {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        const t = this.token;
        if (t) {
            h['Authorization'] = `Bearer ${t}`;
        }
        return h;
    }

    private async handleResponse(res: Response, endpoint: string) {
        if (res.status === 401) {
            // DO NOT trigger logout/redirect for login attempts
            const isAuthRoute = endpoint.includes('/auth/login') || endpoint.includes('/auth/google');

            if (!isAuthRoute) {
                try {
                    localStorage.removeItem('token');
                } catch { }
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            }

            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Unauthorized');
        }
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        const text = await res.text();
        try {
            return text ? JSON.parse(text) : {};
        } catch {
            return text;
        }
    }

    async get(endpoint: string, query?: Record<string, string>) {
        const url = new URL(this.buildUrl(endpoint));
        if (query) {
            Object.entries(query).forEach(([k, v]) => url.searchParams.append(k, v));
        }
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: this.headers,
        });
        return this.handleResponse(res, endpoint);
    }

    async post(endpoint: string, body?: any) {
        const res = await fetch(this.buildUrl(endpoint), {
            method: 'POST',
            headers: this.headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        return this.handleResponse(res, endpoint);
    }

    async put(endpoint: string, body?: any) {
        const res = await fetch(this.buildUrl(endpoint), {
            method: 'PUT',
            headers: this.headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        return this.handleResponse(res, endpoint);
    }

    async patch(endpoint: string, body?: any) {
        const res = await fetch(this.buildUrl(endpoint), {
            method: 'PATCH',
            headers: this.headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        return this.handleResponse(res, endpoint);
    }

    async delete(endpoint: string) {
        const res = await fetch(this.buildUrl(endpoint), {
            method: 'DELETE',
            headers: this.headers,
        });
        return this.handleResponse(res, endpoint);
    }
}

export const api = new ApiClient();

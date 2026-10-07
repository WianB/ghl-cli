// Thin HTTP client for the GHL v2 API (services.leadconnectorhq.com).
export const BASE_URL = 'https://services.leadconnectorhq.com';
export const DEFAULT_VERSION = '2021-07-28';
// Calendars and conversations endpoints only accept the older version.
export const CALENDAR_VERSION = '2021-04-15';
export const CONVERSATIONS_VERSION = '2021-04-15';
export class ApiError extends Error {
    status;
    method;
    path;
    details;
    constructor(status, method, path, details) {
        super(`GHL API ${status} on ${method} ${path}: ${summarise(details)}`);
        this.status = status;
        this.method = method;
        this.path = path;
        this.details = details;
    }
}
function summarise(details) {
    if (details && typeof details === 'object') {
        const d = details;
        const m = d.message ?? d.error ?? d.msg;
        if (Array.isArray(m))
            return m.join('; ');
        if (m)
            return String(m);
    }
    return typeof details === 'string' ? details.slice(0, 300) : JSON.stringify(details)?.slice(0, 300) ?? '';
}
export function buildUrl(path, query) {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, BASE_URL);
    for (const [k, v] of Object.entries(query ?? {})) {
        if (v === undefined || v === null || v === '')
            continue;
        url.searchParams.set(k, String(v));
    }
    return url.toString();
}
export class Client {
    fetchImpl;
    sleep;
    maxRetries;
    cfg;
    constructor(cfg) {
        this.cfg = cfg;
        this.fetchImpl = cfg.fetchImpl ?? fetch;
        this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
        this.maxRetries = cfg.maxRetries ?? 4;
    }
    async request(method, path, opts = {}) {
        const url = buildUrl(path, opts.query);
        const isWrite = method !== 'GET' && !opts.read;
        if (this.cfg.dryRun && isWrite) {
            return { dryRun: true, method, url, body: opts.body ?? null };
        }
        const headers = {
            Authorization: `Bearer ${this.cfg.token}`,
            Version: opts.version ?? DEFAULT_VERSION,
            Accept: 'application/json',
        };
        let payload;
        if (opts.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            payload = JSON.stringify(opts.body);
        }
        for (let attempt = 0;; attempt++) {
            const res = await this.fetchImpl(url, { method, headers, body: payload });
            // Retry rate limits and transient server errors. Writes are only retried
            // on 429, where GHL guarantees the request was not processed.
            const retryable = res.status === 429 || (!isWrite && res.status >= 500);
            if (retryable && attempt < this.maxRetries) {
                const after = Number(res.headers.get('retry-after'));
                const wait = Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** attempt;
                await this.sleep(Math.min(wait, 15000));
                continue;
            }
            const text = await res.text();
            let data = text;
            try {
                data = text ? JSON.parse(text) : null;
            }
            catch {
                // Leave as text.
            }
            if (!res.ok)
                throw new ApiError(res.status, method, path, data);
            return data;
        }
    }
}

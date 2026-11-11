// Thin HTTP client for the GHL API (services.leadconnectorhq.com).
export const BASE_URL = 'https://services.leadconnectorhq.com';
export const DEFAULT_VERSION = '2021-07-28';
// Calendars and conversations endpoints only accept the older version.
export const CALENDAR_VERSION = '2021-04-15';
export const CONVERSATIONS_VERSION = '2021-04-15';
// Voice AI, Conversation AI and knowledge bases also only accept 2021-04-15.
export const AI_VERSION = '2021-04-15';
// GHL's v3 API (spec published 2026-06-19). Same host and paths, selected by
// this Version header. Some endpoints exist only under v3.
export const V3_VERSION = 'v3';
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
// The request never got an HTTP response (DNS, reset connection, timeout).
export class NetworkError extends Error {
    method;
    path;
    constructor(method, path, cause, isWrite) {
        const c = cause?.cause;
        const why = c?.code ?? c?.message ?? cause?.message ?? String(cause);
        super(`Network error on ${method} ${path}: ${why}.` +
            (isWrite ? ' GHL may or may not have applied it; check before re-running.' : ' Retries ran out; try again.'));
        this.method = method;
        this.path = path;
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
            return { dryRun: true, method, url, body: opts.form ? describeForm(opts.form) : opts.body ?? null };
        }
        const headers = {
            Authorization: `Bearer ${this.cfg.token}`,
            Version: opts.version ?? DEFAULT_VERSION,
            Accept: 'application/json',
        };
        let payload;
        if (opts.form) {
            // fetch sets the multipart Content-Type with its boundary.
            payload = opts.form;
        }
        else if (opts.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            payload = JSON.stringify(opts.body);
        }
        for (let attempt = 0;; attempt++) {
            let res;
            try {
                res = await this.fetchImpl(url, { method, headers, body: payload });
            }
            catch (e) {
                // No response at all. Reads are safe to repeat; a write may have landed.
                if (!isWrite && attempt < this.maxRetries) {
                    await this.sleep(Math.min(1000 * 2 ** attempt, 15000));
                    continue;
                }
                throw new NetworkError(method, path, e, isWrite);
            }
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
function describeForm(form) {
    const out = {};
    for (const [k, v] of form.entries()) {
        out[k] = typeof v === 'string' ? v : `<file ${v.name}, ${v.size} bytes>`;
    }
    return out;
}

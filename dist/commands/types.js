import { readFileSync } from 'node:fs';
import { Opts, UsageError } from '../args.js';
export function arg(ctx, i, label) {
    const v = ctx.args[i];
    if (!v)
        throw new UsageError(`Missing <${label}>`);
    return v;
}
export function loc(ctx) {
    const v = ctx.opt.str('location') ?? ctx.profile.locationId;
    if (!v)
        throw new UsageError(`Profile "${ctx.profileName}" has no locationId. Pass -l <locationId>.`);
    return v;
}
export function company(ctx) {
    const v = ctx.opt.str('company') ?? ctx.profile.companyId;
    if (!v)
        throw new UsageError(`This command needs an agency profile with a companyId, or --company <id>.`);
    return v;
}
export function req(ctx, method, path, opts = {}) {
    return ctx.client.request(method, path, { ...opts, query: { ...opts.query, ...extraQuery(ctx) } });
}
// `-q key=value` passes any extra query parameter straight through.
function extraQuery(ctx) {
    const out = {};
    for (const kv of ctx.opt.raw('query-param')) {
        const i = kv.indexOf('=');
        if (i < 1)
            throw new UsageError(`-q expects key=value, got "${kv}"`);
        out[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return out;
}
function parseValue(v) {
    try {
        return JSON.parse(v);
    }
    catch {
        return v;
    }
}
// Build a request body from flags, then `--set key=value`, then `--data`
// (JSON or @file.json). Later sources win.
export function body(ctx, fields, base = {}) {
    const out = { ...base };
    for (const [flag, [key, kind = 's']] of Object.entries(fields)) {
        if (!ctx.opt.has(flag))
            continue;
        if (kind === 'n')
            out[key] = ctx.opt.num(flag);
        else if (kind === 'l')
            out[key] = ctx.opt.list(flag);
        else if (kind === 'b')
            out[key] = ctx.opt.bool(flag);
        else
            out[key] = ctx.opt.str(flag);
    }
    for (const kv of ctx.opt.raw('set')) {
        const i = kv.indexOf('=');
        if (i < 1)
            throw new UsageError(`--set expects key=value, got "${kv}"`);
        out[kv.slice(0, i)] = parseValue(kv.slice(i + 1));
    }
    const data = ctx.opt.str('data');
    if (data)
        Object.assign(out, readJson(data));
    return out;
}
export function readJson(src) {
    const text = src.startsWith('@') ? readFileSync(src.slice(1), 'utf8') : src;
    try {
        const v = JSON.parse(text);
        if (!v || typeof v !== 'object' || Array.isArray(v))
            throw new Error('not an object');
        return v;
    }
    catch (e) {
        throw new UsageError(`--data must be a JSON object or @file.json (${e.message})`);
    }
}
export function query(ctx, fields, base = {}) {
    const out = { ...base };
    for (const [flag, [key]] of Object.entries(fields)) {
        const v = ctx.opt.str(flag);
        if (v !== undefined)
            out[key] = v;
    }
    return out;
}
// Accepts epoch millis, or anything Date can parse ("2026-10-07", ISO time).
export function toMillis(v) {
    if (/^\d{12,}$/.test(v))
        return Number(v);
    const t = Date.parse(v);
    if (Number.isNaN(t))
        throw new UsageError(`Cannot read date "${v}"`);
    return t;
}
export function toIso(v) {
    return new Date(toMillis(v)).toISOString();
}
export function needOne(ctx, flags) {
    if (!flags.some((f) => ctx.opt.has(f)))
        throw new UsageError(`Pass at least one of: ${flags.map((f) => `--${f}`).join(', ')}`);
}

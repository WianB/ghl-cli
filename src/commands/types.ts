import { readFileSync } from 'node:fs';
import { Opts, UsageError } from '../args.ts';
import type { Client, Method, Query, RequestOptions } from '../client.ts';
import type { Profile } from '../profiles.ts';

export interface Ctx {
  args: string[];
  opt: Opts;
  profileName: string;
  profile: Profile;
  client: Client;
  dryRun: boolean;
}

export interface Cmd {
  group: string;
  name: string;
  usage: string;
  summary: string;
  // Changes data in GHL. Blocked from multi-profile fan-out.
  write?: boolean;
  // Reaches real people (SMS, email, publishing, workflows) or deletes data.
  // Refused without --yes.
  confirm?: boolean | ((ctx: Ctx) => boolean);
  // Needs an agency token (companyId) rather than a sub-account token.
  agency?: boolean;
  // MCP tool names this command replaces. Used by the coverage test.
  replaces?: string[];
  run(ctx: Ctx): Promise<unknown>;
}

export function arg(ctx: Ctx, i: number, label: string): string {
  const v = ctx.args[i];
  if (!v) throw new UsageError(`Missing <${label}>`);
  return v;
}

export function loc(ctx: Ctx): string {
  const v = ctx.opt.str('location') ?? ctx.profile.locationId;
  if (!v) throw new UsageError(`Profile "${ctx.profileName}" has no locationId. Pass -l <locationId>.`);
  return v;
}

export function company(ctx: Ctx): string {
  const v = ctx.opt.str('company') ?? ctx.profile.companyId;
  if (!v) throw new UsageError(`This command needs an agency profile with a companyId, or --company <id>.`);
  return v;
}

export function req(ctx: Ctx, method: Method, path: string, opts: RequestOptions = {}): Promise<unknown> {
  return ctx.client.request(method, path, { ...opts, query: { ...opts.query, ...extraQuery(ctx) } });
}

// `-q key=value` passes any extra query parameter straight through.
function extraQuery(ctx: Ctx): Query {
  const out: Query = {};
  for (const kv of ctx.opt.raw('query-param')) {
    const i = kv.indexOf('=');
    if (i < 1) throw new UsageError(`-q expects key=value, got "${kv}"`);
    out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

function parseValue(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

// Map CLI flags onto API body keys. kind: s = string, n = number, l = list, b = bool.
export type FieldMap = Record<string, [apiKey: string, kind?: 's' | 'n' | 'l' | 'b']>;

// Build a request body from flags, then `--set key=value`, then `--data`
// (JSON or @file.json). Later sources win.
export function body(ctx: Ctx, fields: FieldMap, base: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [flag, [key, kind = 's']] of Object.entries(fields)) {
    if (!ctx.opt.has(flag)) continue;
    if (kind === 'n') out[key] = ctx.opt.num(flag);
    else if (kind === 'l') out[key] = ctx.opt.list(flag);
    else if (kind === 'b') out[key] = ctx.opt.bool(flag);
    else out[key] = ctx.opt.str(flag);
  }
  for (const kv of ctx.opt.raw('set')) {
    const i = kv.indexOf('=');
    if (i < 1) throw new UsageError(`--set expects key=value, got "${kv}"`);
    out[kv.slice(0, i)] = parseValue(kv.slice(i + 1));
  }
  const data = ctx.opt.str('data');
  if (data) Object.assign(out, readJson(data));
  return out;
}

export function readJson(src: string): Record<string, unknown> {
  const text = src.startsWith('@') ? readFileSync(src.slice(1), 'utf8') : src;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v as Record<string, unknown>;
  } catch (e) {
    throw new UsageError(`--data must be a JSON object or @file.json (${(e as Error).message})`);
  }
}

export function query(ctx: Ctx, fields: FieldMap, base: Query = {}): Query {
  const out: Query = { ...base };
  for (const [flag, [key]] of Object.entries(fields)) {
    const v = ctx.opt.str(flag);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

// Accepts epoch millis, or anything Date can parse ("2026-10-07", ISO time).
export function toMillis(v: string): number {
  if (/^\d{12,}$/.test(v)) return Number(v);
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new UsageError(`Cannot read date "${v}"`);
  return t;
}

export function toIso(v: string): string {
  return new Date(toMillis(v)).toISOString();
}

export function needOne(ctx: Ctx, flags: string[]): void {
  if (!flags.some((f) => ctx.opt.has(f))) throw new UsageError(`Pass at least one of: ${flags.map((f) => `--${f}`).join(', ')}`);
}

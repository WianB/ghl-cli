// Runs every ghl command against a fake fetch and checks each request
// against GHL's official OpenAPI specs: path+method exist, query params are
// known, required query params are present, body keys are known, required
// body keys are present, and the Version header is one the spec allows.
//
// Usage: npm run spec-check   (downloads the specs into a temp folder, no token needed)
// Known, accepted differences are listed in KNOWN below.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..');
const { main } = await import(join(CLI, 'src/cli.ts'));
const { commands } = await import(join(CLI, 'src/commands/index.ts'));
const SPEC_DIR = process.env.GHL_SPEC_DIR ?? join(tmpdir(), 'ghl-cli-specs');
const SPEC_FILES = ['blogs', 'calendars', 'contacts', 'conversations', 'emails', 'forms', 'invoices', 'locations', 'opportunities', 'payments', 'products', 'social-media-posting', 'users', 'workflows'];
mkdirSync(SPEC_DIR, { recursive: true });
for (const f of SPEC_FILES) {
  const dest = join(SPEC_DIR, `${f}.json`);
  if (existsSync(dest) && !process.argv.includes('--refresh')) continue;
  const res = await fetch(`https://raw.githubusercontent.com/GoHighLevel/highlevel-api-docs/main/apps/${f}.json`);
  if (!res.ok) throw new Error(`Could not download ${f}.json: ${res.status}`);
  writeFileSync(dest, await res.text());
}

// The spec is wrong or incomplete here; checked against the official MCP's behaviour instead.
const KNOWN = [
  /^contacts search .*unknown body key/, // spec lists no body properties for /contacts/search
  /^conversations send .*missing required body "(subType|status)"/, // only needed for custom providers
  /^blogs post-update .*missing required body/, // the CLI sends only what you pass; see command help
];

// ---- load specs
type Op = { file: string; path: string; method: string; op: any; spec: any };
const ops: Op[] = [];
for (const f of readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json'))) {
  const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8'));
  for (const [p, item] of Object.entries<any>(spec.paths ?? {})) {
    for (const m of ['get', 'post', 'put', 'patch', 'delete']) if (item[m]) ops.push({ file: f, path: p, method: m.toUpperCase(), op: { ...item[m], parameters: [...(item.parameters ?? []), ...(item[m].parameters ?? [])] }, spec });
  }
}
const norm = (p: string) => p.replace(/\/+$/, '') || '/';
function findOp(method: string, path: string): Op | undefined {
  const exact = ops.filter((o) => o.method === method).find((o) => {
    const re = new RegExp('^' + norm(o.path).replace(/\{[^}]+\}/g, '[^/]+') + '$');
    return re.test(norm(path));
  });
  return exact;
}
function deref(spec: any, s: any, depth = 0): any {
  if (!s || depth > 10) return s;
  if (s.$ref) return deref(spec, s.$ref.split('/').slice(1).reduce((a: any, k: string) => a?.[k], spec), depth + 1);
  if (s.allOf) return s.allOf.map((x: any) => deref(spec, x, depth + 1)).reduce((a: any, b: any) => ({ properties: { ...a.properties, ...b?.properties }, required: [...(a.required ?? []), ...(b?.required ?? [])] }), { properties: {}, required: [] });
  return s;
}

// ---- sample values
const FLAGS = new Set<string>();
for (const f of ['crm', 'comms', 'content']) {
  const src = readFileSync(join(CLI, 'src/commands', f + '.ts'), 'utf8');
  for (const m of src.matchAll(/'?([a-z-]+)'?: \['/g)) FLAGS.add(m[1]);
  for (const m of src.matchAll(/opt\.(?:need|str|has|bool|list)\('([a-z-]+)'\)/g)) FLAGS.add(m[1]);
}
const SKIP = new Set(['html-file', 'data', 'set', 'location', 'profile', 'company', 'status', 'type', 'schedule', 'include-users', 'completed', 'plain-text']);
const DATE = new Set(['start', 'end', 'from', 'to', 'due', 'published-at', 'date', 'end-date']);
const NUM = new Set(['limit', 'offset', 'skip', 'page', 'value', 'start-after', 'start-after-date']);
const STATUS: Record<string, string> = { blogs: 'DRAFT', social: 'draft', opportunities: 'open', conversations: 'all', payments: 'paid', calendars: 'confirmed' };
const TYPE: Record<string, string> = { conversations: 'SMS', emails: 'html', social: 'post' };

function sample(flag: string, group: string): string {
  if (DATE.has(flag)) return group === 'opportunities' ? '10-01-2026' : '2026-10-01T00:00:00Z';
  if (NUM.has(flag)) return '5';
  if (flag === 'model') return 'contact';
  if (flag === 'email') return 'a@b.co';
  return 'X1';
}

const fetchCalls: any[] = [];
const fakeFetch = (async (u: string, init: any) => {
  fetchCalls.push({ url: new URL(u), method: init?.method ?? 'GET', headers: init?.headers, body: init?.body ? JSON.parse(init.body) : undefined });
  return new Response('{}', { status: 200 });
}) as typeof fetch;

const deps = {
  io: { out: () => {}, err: (s: string) => errs.push(s), readSecret: async () => '' },
  store: { get: () => 'pit-x', set() {}, remove() {} },
  load: () => ({ default: 'loc', profiles: { loc: { kind: 'location', locationId: 'LOC1' }, ag: { kind: 'agency', companyId: 'CO1' } } }),
  save() {},
  fetchImpl: fakeFetch,
  env: {},
};
let errs: string[] = [];

const problems: string[] = [];
let checked = 0;
for (const c of commands) {
  const argv: string[] = [];
  if (c.agency) argv.push('-p', 'ag');
  argv.push(c.group, c.name);
  if (c.usage.trim().startsWith('<')) argv.push('ID1');
  for (const f of FLAGS) if (!SKIP.has(f)) argv.push(`--${f}`, sample(f, c.group));
  if (STATUS[c.group] && c.usage.includes('--status')) argv.push('--status', STATUS[c.group]);
  if (TYPE[c.group] && c.usage.includes('--type')) argv.push('--type', TYPE[c.group]);
  argv.push('--yes');
  fetchCalls.length = 0;
  errs = [];
  const code = await main(argv, deps);
  const key = `${c.group} ${c.name}`;
  if (code !== 0 || fetchCalls.length !== 1) {
    problems.push(`${key}: exit ${code}, ${fetchCalls.length} calls ${errs.join(' ').slice(0, 200)}`);
    continue;
  }
  const call = fetchCalls[0];
  const op = findOp(call.method, call.url.pathname);
  if (!op) {
    problems.push(`${key}: ${call.method} ${call.url.pathname} NOT IN SPEC`);
    continue;
  }
  checked++;
  const where = `${key} -> ${call.method} ${op.path} [${op.file}]`;
  if (norm(op.path) === norm(call.url.pathname) || true) {
    if (op.path.endsWith('/') !== call.url.pathname.endsWith('/') && !op.path.includes('{')) problems.push(`${where}: trailing slash differs (spec "${op.path}", sent "${call.url.pathname}")`);
  }
  const qp = op.op.parameters.filter((p: any) => p.in === 'query');
  const known = new Set(qp.map((p: any) => p.name));
  for (const k of call.url.searchParams.keys()) if (!known.has(k)) problems.push(`${where}: unknown query param "${k}" (spec has: ${[...known].join(', ')})`);
  for (const p of qp) if (p.required && !call.url.searchParams.has(p.name)) problems.push(`${where}: missing required query "${p.name}"`);
  const ver = op.op.parameters.find((p: any) => p.in === 'header' && p.name === 'Version');
  const allowed = ver?.schema?.enum;
  if (allowed && !allowed.includes(call.headers.Version)) problems.push(`${where}: Version ${call.headers.Version} not in ${allowed}`);
  const schema = deref(op.spec, op.op.requestBody?.content?.['application/json']?.schema);
  if (call.body && schema?.properties) {
    const props = new Set(Object.keys(schema.properties));
    for (const k of Object.keys(call.body)) if (!props.has(k)) problems.push(`${where}: unknown body key "${k}"`);
    for (const r of schema.required ?? []) if (!(r in call.body)) problems.push(`${where}: missing required body "${r}"`);
  } else if (call.body && !schema) problems.push(`${where}: sends a body but spec has none`);
}
const real = problems.filter((p) => !KNOWN.some((k) => k.test(p)));
console.log(`commands: ${commands.length}, matched to spec: ${checked}, known differences: ${problems.length - real.length}, problems: ${real.length}`);
for (const p of real) console.log(' - ' + p);
process.exitCode = real.length ? 1 : 0;

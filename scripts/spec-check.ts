// Runs every ghl command against a fake fetch and checks each request
// against GHL's official OpenAPI specs: path+method exist, query params are
// known, required query params are present, body keys are known, required
// body keys are present, and the Version header is one the spec allows.
// Commands that send `Version: v3` are checked against the v3 spec files,
// everything else against the v2 files. It also lists the v2 endpoints the
// CLI uses that the v3 spec no longer has, as an early warning.
//
// Usage: npm run spec-check   (downloads the specs into a temp folder, no token needed)
//        npm run spec-check -- --refresh   (download again)
// Known, accepted differences are listed in KNOWN below.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..');
const { main } = await import(join(CLI, 'src/cli.ts'));
const { commands } = await import(join(CLI, 'src/commands/index.ts'));
const SPEC_DIR = process.env.GHL_SPEC_DIR ?? join(tmpdir(), 'ghl-cli-specs');
const REPO = 'GoHighLevel/highlevel-api-docs';

// Every spec file GHL publishes, v2 in apps/ and v3 in apps/v3/.
async function download(sub: 'apps' | 'apps/v3', dir: string) {
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).some((f) => f.endsWith('.json')) && !process.argv.includes('--refresh')) return;
  const list = await fetch(`https://api.github.com/repos/${REPO}/contents/${sub}`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!list.ok) throw new Error(`Could not list ${sub}: ${list.status}`);
  const files = ((await list.json()) as { name: string; type: string }[]).filter((f) => f.type === 'file' && f.name.endsWith('.json'));
  await Promise.all(files.map(async (f) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${sub}/${f.name}`);
        if (!res.ok) throw new Error(String(res.status));
        writeFileSync(join(dir, f.name), await res.text());
        return;
      } catch (e) {
        if (attempt >= 3) throw new Error(`Could not download ${sub}/${f.name}: ${(e as Error).message}`);
      }
    }
  }));
}
const V2_DIR = join(SPEC_DIR, 'v2');
const V3_DIR = join(SPEC_DIR, 'v3');
await download('apps', V2_DIR);
await download('apps/v3', V3_DIR);

// The spec is wrong or incomplete here; checked against the official MCP's behaviour instead.
const KNOWN = [
  /^contacts search .*unknown body key/, // spec lists no body properties for /contacts/search
  /^conversations send .*missing required body "(subType|status)"/, // only needed for custom providers
  /^blogs post-update .*missing required body/, // the CLI sends only what you pass; see command help
  /^payments orders? .*unknown query param "altType"/, // spec omits it, but the live API 422s without it (checked 2026-11-11)
];

// ---- load specs
type Op = { file: string; path: string; method: string; op: any; spec: any };
function loadOps(dir: string): Op[] {
  const ops: Op[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const spec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const [p, item] of Object.entries<any>(spec.paths ?? {})) {
      for (const m of ['get', 'post', 'put', 'patch', 'delete']) if (item[m]) ops.push({ file: f, path: p, method: m.toUpperCase(), op: { ...item[m], parameters: [...(item.parameters ?? []), ...(item[m].parameters ?? [])] }, spec });
    }
  }
  return ops;
}
const OPS = { v2: loadOps(V2_DIR), v3: loadOps(V3_DIR) };
const norm = (p: string) => p.replace(/\/+$/, '') || '/';
function findOp(method: string, path: string, ops: Op[]): Op | undefined {
  // Literal segments win over {params}: /medias/folder is not /medias/{id}.
  const params = (o: Op) => (o.path.match(/\{/g) ?? []).length;
  const exact = ops.filter((o) => o.method === method).sort((a, b) => params(a) - params(b)).find((o) => {
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
for (const f of readdirSync(join(CLI, 'src/commands')).filter((f) => !['types.ts', 'index.ts'].includes(f))) {
  const src = readFileSync(join(CLI, 'src/commands', f), 'utf8');
  for (const m of src.matchAll(/'?([a-z-]+)'?: \['/g)) FLAGS.add(m[1]);
  for (const m of src.matchAll(/opt\.(?:need|str|has|bool|list)\('([a-z-]+)'\)/g)) FLAGS.add(m[1]);
}
const SKIP = new Set(['html-file', 'data', 'set', 'location', 'profile', 'company', 'status', 'type', 'schedule', 'include-users', 'completed', 'plain-text', 'prop', 'source']);
const DATE = new Set(['start', 'end', 'from', 'to', 'due', 'published-at', 'date', 'end-date']);
const NUM = new Set(['limit', 'offset', 'skip', 'page', 'value', 'start-after', 'start-after-date']);
const STATUS: Record<string, string> = { blogs: 'DRAFT', social: 'draft', opportunities: 'open', conversations: 'all', payments: 'paid', calendars: 'confirmed', emails: 'all' };
const TYPE: Record<string, string> = { conversations: 'SMS', emails: 'html', social: 'post', media: 'file' };

function sample(flag: string, group: string): string {
  if (DATE.has(flag)) return group === 'opportunities' ? '10-01-2026' : '2026-10-01T00:00:00Z';
  if (NUM.has(flag)) return '5';
  if (flag === 'model') return 'contact';
  if (flag === 'email') return 'a@b.co';
  return 'X1';
}

const fetchCalls: any[] = [];
const fakeFetch = (async (u: string, init: any) => {
  const raw = init?.body;
  const body = raw instanceof FormData ? Object.fromEntries([...raw.keys()].map((k) => [k, true])) : raw ? JSON.parse(raw) : undefined;
  fetchCalls.push({ url: new URL(u), method: init?.method ?? 'GET', headers: init?.headers, body, form: raw instanceof FormData });
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
const notInV3: string[] = [];
let checked = 0;
for (const c of commands) {
  const argv: string[] = [];
  if (c.agency) argv.push('-p', 'ag');
  argv.push(c.group, c.name);
  // One sample id per leading <positional> in the usage line.
  const positionals = c.usage.trim().match(/^(<[^>]+>\s*)+/)?.[0].match(/</g)?.length ?? 0;
  for (let i = 0; i < positionals; i++) argv.push(`ID${i + 1}`);
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
  const isV3 = call.headers.Version === 'v3';
  const op = findOp(call.method, call.url.pathname, isV3 ? OPS.v3 : OPS.v2);
  if (!op) {
    problems.push(`${key}: ${call.method} ${call.url.pathname} NOT IN ${isV3 ? 'V3' : 'V2'} SPEC`);
    continue;
  }
  if (!isV3 && !findOp(call.method, call.url.pathname, OPS.v3)) notInV3.push(`${key}: ${call.method} ${op.path}`);
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
  const schema = deref(op.spec, op.op.requestBody?.content?.[call.form ? 'multipart/form-data' : 'application/json']?.schema);
  // An empty properties object means the spec does not describe the body at all.
  if (call.body && schema?.properties && Object.keys(schema.properties).length) {
    const props = new Set(Object.keys(schema.properties));
    for (const k of Object.keys(call.body)) if (!props.has(k)) problems.push(`${where}: unknown body key "${k}"`);
    for (const r of schema.required ?? []) if (!(r in call.body)) problems.push(`${where}: missing required body "${r}"`);
  } else if (call.body && !schema) problems.push(`${where}: sends a body but spec has none`);
}
const real = problems.filter((p) => !KNOWN.some((k) => k.test(p)));
console.log(`commands: ${commands.length}, matched to spec: ${checked} (${OPS.v2.length} v2 and ${OPS.v3.length} v3 endpoints loaded), known differences: ${problems.length - real.length}, problems: ${real.length}`);
for (const p of real) console.log(' - ' + p);
if (notInV3.length) {
  console.log(`\nv2 endpoints in use that the v3 spec does not list (still work today; watch for retirement): ${notInV3.length}`);
  for (const p of notInV3) console.log(' - ' + p);
}
process.exitCode = real.length ? 1 : 0;

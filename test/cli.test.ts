import assert from 'node:assert/strict';
import { test } from 'node:test';
import { main } from '../src/cli.ts';
import type { Deps } from '../src/cli.ts';
import { commands } from '../src/commands/index.ts';
import type { ProfileFile, TokenStore } from '../src/profiles.ts';

interface Call {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}

const TOKENS: Record<string, string> = { eco: 'pit-eco-secret', barber: 'pit-barber-secret', agency: 'pit-agency-secret' };

function setup(opts: { status?: number; reply?: unknown; profiles?: ProfileFile; secret?: string; env?: NodeJS.ProcessEnv } = {}) {
  const calls: Call[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const tokens = { ...TOKENS };
  let saved: ProfileFile | undefined;
  const store: TokenStore = {
    get: (n) => tokens[n],
    set: (n, t) => void (tokens[n] = t),
    remove: (n) => void delete tokens[n],
  };
  const profiles: ProfileFile = opts.profiles ?? {
    default: 'eco',
    profiles: {
      eco: { kind: 'location', locationId: 'LOC_ECO', label: 'Eco Aircon' },
      barber: { kind: 'location', locationId: 'LOC_BARBER', label: 'Triple A' },
      agency: { kind: 'agency', companyId: 'CO_1' },
    },
  };
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      headers: init?.headers as Record<string, string>,
      body: init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const status = opts.status ?? 200;
    return new Response(JSON.stringify(opts.reply ?? { ok: true }), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const deps: Deps = {
    io: { out: (s) => out.push(s), err: (s) => err.push(s), readSecret: async () => opts.secret ?? 'pit-new-token' },
    store,
    load: () => structuredClone(profiles),
    save: (d) => void (saved = d),
    fetchImpl,
    env: opts.env ?? {},
  };
  const run = (line: string[]) => main(line, deps);
  return { run, calls, out, err, tokens, saved: () => saved };
}

const json = (s: string[]) => JSON.parse(s.join('\n'));

test('uses the default profile token and location', async () => {
  const t = setup();
  assert.equal(await t.run(['locations', 'get']), 0);
  assert.equal(t.calls[0].url.pathname, '/locations/LOC_ECO');
  assert.equal(t.calls[0].headers.Authorization, 'Bearer pit-eco-secret');
  assert.equal(t.calls[0].headers.Version, '2021-07-28');
});

test('-p switches account, -l overrides location', async () => {
  const t = setup();
  await t.run(['-p', 'barber', 'opportunities', 'pipelines']);
  assert.equal(t.calls[0].headers.Authorization, 'Bearer pit-barber-secret');
  assert.equal(t.calls[0].url.searchParams.get('locationId'), 'LOC_BARBER');
  await t.run(['-p', 'barber', '-l', 'OTHER', 'opportunities', 'pipelines']);
  assert.equal(t.calls[1].url.searchParams.get('locationId'), 'OTHER');
});

test('GHL_PROFILE picks the account; GHL_TOKEN works with no saved profiles', async () => {
  const t = setup({ env: { GHL_PROFILE: 'barber' } });
  await t.run(['locations', 'get']);
  assert.equal(t.calls[0].headers.Authorization, 'Bearer pit-barber-secret');

  const e = setup({ profiles: { profiles: {} }, env: { GHL_TOKEN: 'pit-env', GHL_LOCATION_ID: 'LOC_ENV' } });
  await e.run(['locations', 'get']);
  assert.equal(e.calls[0].url.pathname, '/locations/LOC_ENV');
  assert.equal(e.calls[0].headers.Authorization, 'Bearer pit-env');
});

test('fan-out runs a read on several accounts and keys results by profile', async () => {
  const t = setup({ reply: { contacts: [] } });
  assert.equal(await t.run(['--profiles', 'eco,barber', 'contacts', 'search', '--query', 'john']), 0);
  assert.deepEqual(Object.keys(json(t.out)), ['eco', 'barber']);
  assert.deepEqual(t.calls.map((c) => (c.body as { locationId: string }).locationId), ['LOC_ECO', 'LOC_BARBER']);
});

test('--all-profiles skips agency profiles', async () => {
  const t = setup();
  await t.run(['--all-profiles', 'locations', 'get']);
  assert.deepEqual(Object.keys(json(t.out)), ['eco', 'barber']);
});

test('fan-out refuses write commands', async () => {
  const t = setup();
  assert.equal(await t.run(['--profiles', 'eco,barber', 'contacts', 'create', '--email', 'a@b.co']), 2);
  assert.equal(t.calls.length, 0);
});

test('sending a message needs --yes; --dry-run shows it without sending', async () => {
  const t = setup();
  const line = ['conversations', 'send', '--type', 'SMS', '--contact', 'C1', '--message', 'Hi'];
  assert.equal(await t.run(line), 2);
  assert.match(t.err.join(''), /--yes/);
  assert.equal(t.calls.length, 0);

  assert.equal(await t.run([...line, '--dry-run']), 0);
  assert.equal(t.calls.length, 0);
  const dry = json(t.out);
  assert.equal(dry.dryRun, true);
  assert.deepEqual(dry.body, { type: 'SMS', contactId: 'C1', message: 'Hi' });

  t.out.length = 0;
  assert.equal(await t.run([...line, '--yes']), 0);
  assert.equal(t.calls[0].method, 'POST');
  assert.equal(t.calls[0].url.pathname, '/conversations/messages');
});

test('blog drafts need no --yes, publishing does', async () => {
  const t = setup();
  const base = ['blogs', 'post-create', '--blog', 'B1', '--title', 'T', '--slug', 't', '--html', '<p>x</p>'];
  assert.equal(await t.run([...base, '--status', 'draft']), 0);
  assert.equal((t.calls[0].body as { status: string }).status, 'DRAFT');
  assert.equal(await t.run([...base, '--status', 'published']), 2);
  assert.equal(t.calls.length, 1);
});

test('social posts default to draft; a scheduled post needs --yes', async () => {
  const t = setup();
  assert.equal(await t.run(['social', 'post-create', '--account', 'A1', '--user', 'U1', '--summary', 'hello']), 0);
  assert.equal((t.calls[0].body as { status: string }).status, 'draft');
  assert.equal(await t.run(['social', 'post-create', '--account', 'A1', '--user', 'U1', '--summary', 'x', '--status', 'scheduled']), 2);
});

test('workflow enrolment and deletes need --yes', async () => {
  const t = setup();
  assert.equal(await t.run(['contacts', 'workflow-add', 'C1', '--workflow', 'W1']), 2);
  assert.equal(await t.run(['contacts', 'delete', 'C1']), 2);
  assert.equal(await t.run(['opportunities', 'delete', 'O1']), 2);
  assert.equal(t.calls.length, 0);
});

test('contact create maps flags, --set and --data into the body', async () => {
  const t = setup();
  await t.run([
    'contacts', 'create', '--first', 'Jo', '--email', 'jo@x.co', '--tag', 'a,b', '--tag', 'c',
    '--set', 'dnd=true', '--data', '{"customFields":[{"id":"F1","fieldValue":"v"}]}',
  ]);
  assert.deepEqual(t.calls[0].body, {
    locationId: 'LOC_ECO', firstName: 'Jo', email: 'jo@x.co', tags: ['a', 'b', 'c'], dnd: true,
    customFields: [{ id: 'F1', fieldValue: 'v' }],
  });
});

test('calendar events convert dates to millis and use the calendar API version', async () => {
  const t = setup();
  await t.run(['calendars', 'events', '--calendar', 'CAL', '--start', '2026-10-01T00:00:00Z', '--end', '2026-10-02T00:00:00Z']);
  const c = t.calls[0];
  assert.equal(c.headers.Version, '2021-04-15');
  assert.equal(c.url.searchParams.get('startTime'), String(Date.parse('2026-10-01T00:00:00Z')));
  assert.equal(c.url.searchParams.get('calendarId'), 'CAL');
});

test('conversations use API version 2021-04-15', async () => {
  const t = setup();
  await t.run(['conversations', 'search', '--contact', 'C1']);
  await t.run(['conversations', 'messages', 'CONV1']);
  await t.run(['conversations', 'send', '--type', 'Email', '--contact', 'C1', '--html', '<p>x</p>', '--subject', 's', '--yes']);
  assert.deepEqual(t.calls.map((c) => c.headers.Version), ['2021-04-15', '2021-04-15', '2021-04-15']);
});

test('opportunity update never sends contactId', async () => {
  const t = setup();
  await t.run(['opportunities', 'update', 'O1', '--stage', 'S2', '--contact', 'C1']);
  assert.deepEqual(t.calls[0].body, { pipelineStageId: 'S2' });
});

test('orders send altType=location (GHL 422s without it since late 2026)', async () => {
  const t = setup();
  await t.run(['payments', 'order', 'ORD1']);
  await t.run(['payments', 'orders']);
  for (const c of t.calls) {
    assert.equal(c.url.searchParams.get('altId'), 'LOC_ECO');
    assert.equal(c.url.searchParams.get('altType'), 'location');
  }
});

test('v3 commands send Version v3; --api-version overrides any command', async () => {
  const t = setup();
  await t.run(['emails', 'campaigns', '--status', 'sent']);
  assert.equal(t.calls[0].headers.Version, 'v3');
  assert.equal(t.calls[0].url.pathname, '/emails/locations/LOC_ECO/campaigns/emails');
  await t.run(['emails', 'campaign-stats', 'CMP1']);
  assert.equal(t.calls[1].url.pathname, '/emails/locations/LOC_ECO/campaigns/stats/email-campaigns/CMP1');
  await t.run(['opportunities', 'pipelines', '--api-version', 'v3']);
  assert.equal(t.calls[2].headers.Version, 'v3');
  await t.run(['api', 'GET', '/locations/{locationId}', '--api-version', '2021-04-15']);
  assert.equal(t.calls[3].headers.Version, '2021-04-15');
});

test('email template update refuses an empty change, delete needs --yes', async () => {
  const t = setup();
  assert.equal(await t.run(['emails', 'template-update', 'T1']), 2);
  assert.equal(await t.run(['emails', 'template-delete', 'T1']), 2);
  assert.equal(await t.run(['emails', 'template-update', 'T1', '--subject', 'Hi', '--archived', 'false']), 0);
  assert.equal(t.calls[0].method, 'PATCH');
  assert.deepEqual(t.calls[0].body, { subjectLine: 'Hi', archived: false });
});

test('media upload sends a multipart form; --url imports instead', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const file = join(mkdtempSync(join(tmpdir(), 'ghl-test-')), 'hero.png');
  writeFileSync(file, 'png-bytes');
  const t = setup();
  assert.equal(await t.run(['media', 'upload', file, '--folder', 'F1']), 0);
  const b = t.calls[0].body as Record<string, unknown>;
  assert.equal(t.calls[0].url.pathname, '/medias/upload-file');
  assert.equal(b.hosted, 'false');
  assert.equal(b.parentId, 'F1');
  assert.equal((b.file as File).name, 'hero.png');
  assert.equal(t.calls[0].headers['Content-Type'], undefined);

  await t.run(['media', 'upload', '--url', 'https://x.co/a.jpg', '--name', 'A']);
  assert.deepEqual(t.calls[1].body, { hosted: 'true', fileUrl: 'https://x.co/a.jpg', name: 'A' });

  assert.equal(await t.run(['media', 'upload', join(tmpdir(), 'no-such-file.png')]), 2);
  assert.equal(await t.run(['media', 'delete', 'M1']), 2);
  assert.equal(t.calls.length, 2);
});

test('media upload --dry-run describes the file instead of sending it', async () => {
  const t = setup();
  assert.equal(await t.run(['media', 'upload', '--url', 'https://x.co/a.jpg', '--dry-run']), 0);
  assert.equal(t.calls.length, 0);
  assert.deepEqual(json(t.out).body, { hosted: 'true', fileUrl: 'https://x.co/a.jpg' });
});

test('custom values need name and value; objects take --prop', async () => {
  const t = setup();
  assert.equal(await t.run(['locations', 'custom-value-update', 'CV1', '--value', 'x']), 2);
  assert.equal(await t.run(['locations', 'custom-value-update', 'CV1', '--name', 'Link', '--value', 'https://x.co']), 2);
  await t.run(['locations', 'custom-value-update', 'CV1', '--name', 'Link', '--value', 'https://x.co', '--yes']);
  assert.equal(t.calls[0].method, 'PUT');
  assert.deepEqual(t.calls[0].body, { name: 'Link', value: 'https://x.co' });
  await t.run(['objects', 'record-create', 'custom_objects.rooms', '--prop', 'name=Cabin 1', '--prop', 'beds=2']);
  assert.deepEqual(t.calls[1].body, { locationId: 'LOC_ECO', properties: { name: 'Cabin 1', beds: '2' } });
  await t.run(['objects', 'record', 'custom_objects.rooms', 'R1']);
  assert.equal(t.calls[2].url.pathname, '/objects/custom_objects.rooms/records/R1');
});

test('voice AI and knowledge bases use API version 2021-04-15', async () => {
  const t = setup();
  await t.run(['voice', 'calls', '--start', '2026-11-01T00:00:00Z']);
  await t.run(['ai', 'faqs', 'KB1']);
  assert.deepEqual(t.calls.map((c) => c.headers.Version), ['2021-04-15', '2021-04-15']);
  assert.equal(t.calls[0].url.searchParams.get('startDate'), String(Date.parse('2026-11-01T00:00:00Z')));
  assert.equal(t.calls[1].url.searchParams.get('knowledgeBaseId'), 'KB1');
});

test('read-only POST endpoints still run under --dry-run', async () => {
  const t = setup();
  await t.run(['social', 'posts', '--from', '2026-09-01', '--to', '2026-10-01', '--dry-run']);
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].url.pathname, '/social-media-posting/LOC_ECO/posts/list');
});

test('raw api fills {locationId}, and non-GET needs --yes unless --read', async () => {
  const t = setup();
  await t.run(['api', 'GET', '/locations/{locationId}/tags', '-q', 'x=1']);
  assert.equal(t.calls[0].url.pathname, '/locations/LOC_ECO/tags');
  assert.equal(t.calls[0].url.searchParams.get('x'), '1');
  assert.equal(await t.run(['api', 'POST', '/contacts/search', '--data', '{"locationId":"L"}']), 2);
  assert.equal(await t.run(['api', 'POST', '/contacts/search', '--read', '--data', '{"locationId":"L"}']), 0);
  assert.deepEqual(t.calls[1].body, { locationId: 'L' });
});

test('agency commands use the companyId', async () => {
  const t = setup();
  await t.run(['-p', 'agency', 'locations', 'list']);
  assert.equal(t.calls[0].url.searchParams.get('companyId'), 'CO_1');
});

test('API errors exit 1 and never print the token', async () => {
  const t = setup({ status: 401, reply: { statusCode: 401, message: 'Invalid Private Integration token' } });
  assert.equal(await t.run(['locations', 'get']), 1);
  const text = t.err.join('\n');
  assert.match(text, /401/);
  assert.doesNotMatch(text, /pit-eco-secret/);
});

test('429 is retried, then succeeds', async () => {
  const { Client } = await import('../src/client.ts');
  let n = 0;
  const client = new Client({
    token: 't',
    sleep: async () => {},
    fetchImpl: (async () => (++n < 3 ? new Response('{}', { status: 429 }) : new Response('{"ok":1}', { status: 200 }))) as typeof fetch,
  });
  assert.deepEqual(await client.request('POST', '/contacts/'), { ok: 1 });
  assert.equal(n, 3);
});

test('network errors are retried on reads, never on writes, and name the cause', async () => {
  const { Client, NetworkError } = await import('../src/client.ts');
  const drop = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  let n = 0;
  const flaky = new Client({
    token: 't', sleep: async () => {},
    fetchImpl: (async () => {
      if (++n < 3) throw drop();
      return new Response('{"ok":1}', { status: 200 });
    }) as typeof fetch,
  });
  assert.deepEqual(await flaky.request('GET', '/contacts/'), { ok: 1 });
  assert.equal(n, 3);

  let w = 0;
  const write = new Client({ token: 't', sleep: async () => {}, fetchImpl: (async () => { w++; throw drop(); }) as typeof fetch });
  await assert.rejects(write.request('POST', '/contacts/'), (e: Error) => e instanceof NetworkError && /ECONNRESET/.test(e.message) && /may or may not/.test(e.message));
  assert.equal(w, 1);
});

test('auth add verifies the token, stores it, and sets the first default', async () => {
  const t = setup({ profiles: { profiles: {} }, reply: { location: { name: 'Eco Aircon Cleaning' } }, secret: 'pit-fresh\n' });
  assert.equal(await t.run(['auth', 'add', 'eco', '--location', 'LOC_ECO', '--label', 'Eco']), 0);
  assert.equal(t.tokens.eco, 'pit-fresh');
  assert.equal(t.saved()?.default, 'eco');
  assert.equal(t.calls[0].headers.Authorization, 'Bearer pit-fresh');
  assert.doesNotMatch(t.out.join('') + t.err.join(''), /pit-fresh/);
});

test('auth add saves nothing when GHL rejects the token', async () => {
  const t = setup({ profiles: { profiles: {} }, status: 401, reply: { message: 'Invalid Private Integration token' } });
  t.tokens.eco = undefined as never;
  assert.equal(await t.run(['auth', 'add', 'eco', '--location', 'LOC_ECO']), 1);
  assert.equal(t.saved(), undefined);
  assert.equal(t.tokens.eco, undefined);
});

test('auth list shows profiles without tokens', async () => {
  const t = setup();
  await t.run(['auth', 'list']);
  const text = t.out.join('\n');
  assert.match(text, /eco \*/);
  assert.doesNotMatch(text, /pit-/);
});

test('file token store keeps tokens in an owner-only file', async () => {
  const { mkdtempSync, statSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileStore } = await import('../src/profiles.ts');
  const path = join(mkdtempSync(join(tmpdir(), 'ghl-test-')), 'sub', 'tokens.json');
  const s = fileStore(path);
  assert.equal(s.get('a'), undefined);
  s.set('a', 'pit-a');
  s.set('b', 'pit-b');
  s.remove('a');
  assert.equal(s.get('a'), undefined);
  assert.equal(s.get('b'), 'pit-b');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { b: 'pit-b' });
});

test('--version prints the API snapshot date', async () => {
  const t = setup();
  assert.equal(await t.run(['--version']), 0);
  assert.match(t.out.join(''), /GHL API snapshot \d{4}-\d{2}-\d{2}/);
});

test('skill command reference matches the CLI', async () => {
  const { readFileSync } = await import('node:fs');
  const { COMMANDS_MD, renderCommands } = await import('../scripts/skill-docs.ts');
  assert.equal(readFileSync(COMMANDS_MD, 'utf8'), renderCommands(), 'Run: npm run skill-docs');
});

test('every official GHL MCP tool has a CLI replacement', () => {
  const MCP_TOOLS = [
    'blogs_check-url-slug-exists', 'blogs_create-blog-post', 'blogs_get-all-blog-authors-by-location',
    'blogs_get-all-categories-by-location', 'blogs_get-blog-post', 'blogs_get-blogs', 'blogs_update-blog-post',
    'calendars_get-appointment-notes', 'calendars_get-calendar-events',
    'contacts_add-tags', 'contacts_create-contact', 'contacts_get-all-tasks', 'contacts_get-contact',
    'contacts_get-contacts', 'contacts_remove-tags', 'contacts_update-contact', 'contacts_upsert-contact',
    'conversations_get-messages', 'conversations_search-conversation', 'conversations_send-a-new-message',
    'emails_create-template', 'emails_fetch-template',
    'locations_get-custom-fields', 'locations_get-location',
    'opportunities_get-opportunity', 'opportunities_get-pipelines', 'opportunities_search-opportunity', 'opportunities_update-opportunity',
    'payments_get-order-by-id', 'payments_list-transactions',
    'social-media-posting_create-post', 'social-media-posting_edit-post', 'social-media-posting_get-account',
    'social-media-posting_get-post', 'social-media-posting_get-posts', 'social-media-posting_get-social-media-statistics',
  ];
  assert.equal(MCP_TOOLS.length, 36);
  const covered = new Set(commands.flatMap((c) => c.replaces ?? []));
  assert.deepEqual(MCP_TOOLS.filter((t) => !covered.has(t)), []);
});

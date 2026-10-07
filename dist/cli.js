// ghl: multi-account GoHighLevel CLI.
//
//   ghl [-p profile] <group> <command> [args] [options]
//   ghl --profiles a,b <group> <command>     run a read command on several accounts
//   ghl auth add|list|remove|default|test     manage accounts (tokens in the OS secret store)
//   ghl api <METHOD> <path>                   raw call to any GHL v2 endpoint
import { Opts, parseArgs, UsageError } from './args.js';
import { ApiError, Client } from './client.js';
import { commands, findCommand } from './commands/index.js';
import { loc, readJson, req } from './commands/types.js';
import { configPath, defaultStore, loadProfiles, NAME_RE, ProfileError, resolveProfile, saveProfiles } from './profiles.js';
import { API_SNAPSHOT, VERSION } from './version.js';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function main(argv, deps) {
    const { io } = deps;
    try {
        const { positionals, options } = parseArgs(argv);
        const opt = new Opts(options);
        const [group, name, ...rest] = positionals;
        if (group === 'version' || (!group && opt.bool('version'))) {
            io.out(`ghl ${VERSION} (GHL API snapshot ${API_SNAPSHOT.date}, spec ${API_SNAPSHOT.specCommit.slice(0, 7)})`);
            return 0;
        }
        if (!group || group === 'help') {
            io.out(helpText(name));
            return 0;
        }
        if (group === 'auth')
            return await auth(name, rest, opt, deps);
        let cmd;
        if (group === 'api') {
            cmd = rawApi;
        }
        else {
            cmd = findCommand(group, name);
            if (!cmd && !name && commands.some((c) => c.group === group)) {
                io.out(helpText(group));
                return 0;
            }
            if (!cmd) {
                io.err(`Unknown command "${[group, name].filter(Boolean).join(' ')}".\n\n${helpText(name ? group : undefined)}`);
                return 2;
            }
        }
        if (opt.bool('help')) {
            io.out(`ghl ${cmd.group} ${cmd.name} ${cmd.usage}\n  ${cmd.summary}`);
            return 0;
        }
        const args = group === 'api' ? [name, ...rest].filter(Boolean) : rest;
        const data = deps.load();
        const targets = fanOutTargets(opt, data);
        if (targets && cmd.write) {
            throw new UsageError('Commands that change data run on one profile at a time. Drop --profiles / --all-profiles.');
        }
        const runOne = async (profileName) => {
            const r = resolveProfile(profileName, data, deps.store, deps.env ?? process.env);
            const ctx = {
                args, opt, profileName: r.name, profile: r.profile, dryRun: opt.bool('dry-run'),
                client: new Client({ token: r.token, dryRun: opt.bool('dry-run'), fetchImpl: deps.fetchImpl }),
            };
            const mustConfirm = typeof cmd.confirm === 'function' ? cmd.confirm(ctx) : !!cmd.confirm;
            if (mustConfirm && !ctx.dryRun && !opt.bool('yes')) {
                throw new UsageError(`"${cmd.group} ${cmd.name}" sends to real people, publishes, or deletes data in "${r.name}". ` +
                    'Check it with --dry-run, then re-run with --yes.');
            }
            return cmd.run(ctx);
        };
        let result;
        if (targets) {
            const out = {};
            for (const t of targets) {
                try {
                    out[t] = await runOne(t);
                }
                catch (e) {
                    out[t] = { error: errorInfo(e) };
                }
            }
            result = out;
        }
        else {
            result = await runOne(opt.str('profile'));
        }
        io.out(JSON.stringify(result, null, opt.bool('compact') ? 0 : 2));
        return 0;
    }
    catch (e) {
        return fail(e, io);
    }
}
function fanOutTargets(opt, data) {
    if (opt.bool('all-profiles')) {
        const names = Object.keys(data.profiles).filter((n) => data.profiles[n].kind === 'location');
        if (!names.length)
            throw new ProfileError('No sub-account profiles saved yet.');
        return names;
    }
    return opt.list('profiles');
}
function errorInfo(e) {
    if (e instanceof ApiError)
        return { type: 'api', status: e.status, message: e.message };
    return { type: e instanceof UsageError ? 'usage' : 'error', message: e.message };
}
function fail(e, io) {
    if (e instanceof UsageError || e instanceof ProfileError) {
        io.err(`Error: ${e.message}`);
        return 2;
    }
    if (e instanceof ApiError) {
        io.err(JSON.stringify({ error: errorInfo(e), details: e.details }, null, 2));
        return 1;
    }
    io.err(`Error: ${e.message ?? String(e)}`);
    return 1;
}
// ---- raw API escape hatch
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const rawApi = {
    group: 'api', name: '<METHOD> <path>',
    usage: "[-q key=value] [--data '{...}' | --data @body.json] [--api-version 2021-04-15] [--read] [--yes]",
    summary: 'Call any GHL v2 endpoint. {locationId} in the path is filled from the profile. Non-GET needs --yes unless --read.',
    write: false,
    confirm: (c) => (c.args[0] ?? '').toUpperCase() !== 'GET' && !c.opt.has('read'),
    async run(c) {
        const method = (c.args[0] ?? '').toUpperCase();
        if (!METHODS.includes(method))
            throw new UsageError(`First argument must be one of ${METHODS.join(', ')}`);
        const raw = c.args[1];
        if (!raw)
            throw new UsageError('Missing <path>, e.g. /contacts/abc123');
        const path = raw.includes('{locationId}') ? raw.replaceAll('{locationId}', loc(c)) : raw;
        const data = c.opt.str('data');
        return req(c, method, path, {
            body: data ? readJson(data) : undefined,
            version: c.opt.str('api-version'),
            read: c.opt.has('read'),
        });
    },
};
// ---- auth (no API call needed except verify/test)
async function auth(sub, args, opt, deps) {
    const { io, store } = deps;
    const data = deps.load();
    switch (sub) {
        case 'add': {
            const name = args[0];
            if (!name || !NAME_RE.test(name))
                throw new UsageError('Usage: ghl auth add <name> --location <id> [--label "Client"] [--agency --company <id>] [--token-stdin]  (name: lowercase, digits, - or _)');
            const agency = opt.bool('agency');
            const profile = {
                kind: agency ? 'agency' : 'location',
                label: opt.str('label'),
                locationId: opt.str('location'),
                companyId: opt.str('company'),
                addedAt: new Date().toISOString(),
            };
            if (!agency && !profile.locationId)
                throw new UsageError('A sub-account profile needs --location <locationId>.');
            if (agency && !profile.companyId)
                throw new UsageError('An agency profile needs --company <companyId>.');
            const token = (await io.readSecret(`Paste the GHL Private Integration Token for "${name}" (input hidden): `, opt.bool('token-stdin'))).trim();
            if (!token)
                throw new UsageError('No token entered.');
            if (!opt.bool('no-verify')) {
                const check = await verify(token, profile, deps.fetchImpl);
                if (!check.ok) {
                    io.err(`Token rejected by GHL (${check.status}): ${check.message}\nNothing was saved. Use --no-verify to save anyway.`);
                    return 1;
                }
                io.err(`Verified: ${check.message}`);
            }
            store.set(name, token);
            data.profiles[name] = profile;
            if (!data.default)
                data.default = name;
            deps.save(data);
            io.out(`Saved profile "${name}"${data.default === name ? ' (default)' : ''}. Token stored in: ${deps.storeKind ?? 'token store'}.`);
            return 0;
        }
        case 'list':
        case undefined: {
            const names = Object.keys(data.profiles).sort();
            if (!names.length) {
                io.out(`No profiles yet. Config: ${configPath()}\nAdd one: ghl auth add <name> --location <locationId> --label "Client name"`);
                return 0;
            }
            const rows = names.map((n) => {
                const p = data.profiles[n];
                return {
                    profile: n + (data.default === n ? ' *' : ''),
                    kind: p.kind,
                    label: p.label ?? '',
                    id: (p.kind === 'agency' ? p.companyId : p.locationId) ?? '',
                    token: store.get(n) ? 'saved' : 'MISSING',
                };
            });
            io.out(opt.bool('compact') ? JSON.stringify(rows) : table(rows) + '\n\n* = default');
            return 0;
        }
        case 'remove': {
            const name = args[0];
            if (!name || !data.profiles[name])
                throw new UsageError(`Unknown profile "${name ?? ''}".`);
            delete data.profiles[name];
            if (data.default === name)
                delete data.default;
            store.remove(name);
            deps.save(data);
            io.out(`Removed profile "${name}" and its saved token.`);
            return 0;
        }
        case 'default': {
            const name = args[0];
            if (!name || !data.profiles[name])
                throw new UsageError(`Unknown profile "${name ?? ''}".`);
            data.default = name;
            deps.save(data);
            io.out(`Default profile is now "${name}".`);
            return 0;
        }
        case 'test': {
            const names = args[0] ? [args[0]] : Object.keys(data.profiles).sort();
            if (!names.length)
                throw new ProfileError('No profiles to test.');
            const results = {};
            let bad = 0;
            for (const n of names) {
                const p = data.profiles[n];
                const token = store.get(n);
                if (!p)
                    results[n] = { ok: false, message: 'unknown profile' };
                else if (!token)
                    results[n] = { ok: false, message: 'no saved token' };
                else
                    results[n] = await verify(token, p, deps.fetchImpl);
                if (!results[n].ok)
                    bad++;
            }
            io.out(JSON.stringify(results, null, 2));
            return bad ? 1 : 0;
        }
        default:
            throw new UsageError(`Unknown auth command "${sub}". Use: add, list, remove, default, test.`);
    }
}
async function verify(token, p, fetchImpl) {
    const client = new Client({ token, fetchImpl, maxRetries: 1 });
    try {
        if (p.kind === 'agency') {
            const r = (await client.request('GET', '/locations/search', { query: { companyId: p.companyId, limit: 1 } }));
            return { ok: true, status: 200, message: `agency token works (${r.locations ? 'locations readable' : 'ok'})` };
        }
        const r = (await client.request('GET', `/locations/${p.locationId}`));
        return { ok: true, status: 200, message: `sub-account "${r.location?.name ?? p.locationId}"` };
    }
    catch (e) {
        if (e instanceof ApiError)
            return { ok: false, status: e.status, message: e.message };
        return { ok: false, message: e.message };
    }
}
function table(rows) {
    const cols = Object.keys(rows[0]);
    const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => r[c].length)));
    const line = (vals) => vals.map((v, i) => v.padEnd(w[i])).join('  ').trimEnd();
    return [line(cols), line(w.map((n) => '-'.repeat(n))), ...rows.map((r) => line(cols.map((c) => r[c])))].join('\n');
}
// ---- help
export function helpText(group) {
    const groups = [...new Set(commands.map((c) => c.group))];
    if (group && groups.includes(group)) {
        const list = commands.filter((c) => c.group === group);
        return [`ghl ${group} <command>`, '', ...list.map((c) => `  ${c.name.padEnd(18)} ${c.summary}${c.agency ? ' [agency]' : ''}${c.confirm ? ' [--yes]' : ''}\n  ${' '.repeat(18)} ${c.usage}`)].join('\n');
    }
    return `ghl: multi-account GoHighLevel CLI

Usage
  ghl [-p <profile>] <group> <command> [args] [options]

Accounts
  ghl auth add <name> --location <id> [--label "Client"]   save a sub-account token (prompted, hidden)
  ghl auth add <name> --agency --company <id>             save an agency token
  ghl auth list | test [name] | default <name> | remove <name>

Groups
  ${groups.join(', ')}
  ghl <group>            list that group's commands
  ghl api <METHOD> <path> [--data json] [-q k=v]   any other endpoint

Global options
  -p, --profile <name>       account to use (else GHL_PROFILE, else the default)
  --profiles a,b | --all-profiles   run a read-only command on several accounts
  -l, --location <id>        override the profile's sub-account
  -q key=value               extra query parameter (repeatable)
  --set key=value            extra body field (repeatable, JSON values allowed)
  -d, --data '{..}' | @file  extra body fields as JSON
  --dry-run                  show write requests instead of sending them
  --yes                      required for sending, publishing, workflows, deletes
  --compact                  one-line JSON
  --version                  version and GHL API snapshot date

Profiles: ${configPath()}  (tokens are kept in the OS secret store, never in this file)`;
}
// ---- process entry
async function readSecret(prompt, fromStdin) {
    const stdin = process.stdin;
    if (fromStdin || !stdin.isTTY) {
        const chunks = [];
        for await (const c of stdin)
            chunks.push(c);
        return Buffer.concat(chunks).toString('utf8');
    }
    process.stderr.write(prompt);
    return new Promise((resolve, reject) => {
        let buf = '';
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        const onData = (s) => {
            for (const ch of s) {
                if (ch === '\r' || ch === '\n') {
                    done();
                    return resolve(buf);
                }
                if (ch === '\u0003') {
                    done();
                    return reject(new UsageError('Cancelled.'));
                }
                if (ch === '\u007f' || ch === '\b')
                    buf = buf.slice(0, -1);
                else
                    buf += ch;
            }
        };
        const done = () => {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.off('data', onData);
            process.stderr.write('\n');
        };
        stdin.on('data', onData);
    });
}
export async function runCli(argv = process.argv.slice(2)) {
    const { store, kind } = defaultStore();
    process.exitCode = await main(argv, {
        io: { out: (str) => process.stdout.write(str + '\n'), err: (str) => process.stderr.write(str + '\n'), readSecret },
        store,
        storeKind: kind,
        load: () => loadProfiles(),
        save: (d) => saveProfiles(d),
    });
}
// Run when executed directly (bin/ghl.js calls runCli itself).
const entry = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url))
    await runCli();

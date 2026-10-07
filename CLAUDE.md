# Working on ghl-cli

Notes for anyone (person or coding agent) changing this code. User-facing docs are in `README.md`.

## Layout

- `bin/ghl.js`: launcher. Runs `dist/cli.js` when it exists, otherwise `src/cli.ts` directly.
- `src/cli.ts`: entry point, `auth` subcommands, raw `api` command, `--yes` gate, multi-profile fan-out, help.
- `src/args.ts`: argv parser. Any flag that never takes a value must be listed in `BOOL_FLAGS`.
- `src/profiles.ts`: profile JSON (`~/.config/ghl-cli/profiles.json`) and the token stores (Keychain, libsecret, owner-only file).
- `src/client.ts`: fetch wrapper. `Version` header, retries on 429 and on 5xx for reads, dry-run short-circuit.
- `src/commands/{crm,comms,content}.ts`: one `Cmd` object per command. `index.ts` collects them.
- `src/version.ts`: release version and the GHL API snapshot it was checked against.
- `dist/`: compiled output, committed so installs from GitHub work without a build. CI fails if it is stale.

## Rules for changing it

- No runtime dependencies. Node strips the types, so only erasable TypeScript is allowed: no enums, no namespaces, no constructor parameter properties. `erasableSyntaxOnly` in `tsconfig.json` enforces this. Imports use `.ts` extensions.
- Mark a command `write: true` if it changes data, and give it `confirm` if it reaches real people, publishes, or deletes. `confirm` can be a function when only some inputs are risky (see `blogGoesLive`).
- A POST that only reads (search endpoints) must pass `read: true`, or `--dry-run` will skip it.
- Calendar and conversation endpoints need `CALENDAR_VERSION` / `CONVERSATIONS_VERSION` (2021-04-15); everything else uses 2021-07-28.
- If a command replaces an official HighLevel MCP tool, list the tool name in `replaces`. The coverage test checks all 36.
- Never print a token. Tokens only travel in the `Authorization` header; error messages are built from the path.
- After changes run `npm test`, `npm run typecheck`, `npm run spec-check` and `npm run build`, and commit `dist/`.

## Releasing

Versions are dates (`YYYY.M.D`). For a new release: run `npm run spec-check -- --refresh`, fix anything it reports, update `src/version.ts` (version, snapshot date, spec commit from github.com/GoHighLevel/highlevel-api-docs) and `package.json`, add a `CHANGELOG.md` entry, build, commit, tag `vYYYY.M.D`.

## Testing against GHL

Tests use a fake `fetch` and an in-memory token store, so they never touch the network or a real secret store. For a live check, stick to reads (`locations get`, `opportunities pipelines`) on an account you own. Never run `conversations send`, `contacts workflow-add`, `calendars book` or publish commands against a real account just to test.

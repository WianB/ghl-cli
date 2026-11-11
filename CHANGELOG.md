# Changelog

Versions are dates. Each release is built and checked against the GoHighLevel API as published on that date.

## 2026.11.11

Checked against the same GHL spec commit as 2026.10.7 (HighLevel has not changed the v2 files since 2026-06-19), now including the v3 spec files that commit added, and run live against a sub-account.

Fixed
- `payments orders` and `payments order` failed with 422 "altType should not be empty". GHL now requires `altType=location` on both, although the spec still leaves it out.
- A dropped connection (`fetch failed`) ended the command with no detail. Reads now retry it with backoff like a 5xx; writes do not retry, and the error names the cause and says the write may or may not have landed.

Added
- v3 support. `--api-version <v>` now works on every command, not only `ghl api`. New v3-only commands: `emails template`, `template-update`, `template-delete`, `campaigns`, `campaign`, `campaign-stats`.
- `media` group: `list`, `upload` (a local file, or `--url` to import one), `folder-create`, `delete`. Uploads are multipart and still honour `--dry-run`.
- Custom values: `locations custom-values`, `custom-value-create`, `custom-value-update` (needs `--yes`, since live templates change with it), `custom-value-delete`.
- `objects` group for custom objects: `list`, `get`, `search`, `record`, `record-create`, `record-update`, `record-delete`, with `--prop key=value` for record fields.
- `voice` group for Voice AI: `agents`, `agent`, `calls`, `call`.
- `ai` group: Conversation AI `agents`, `knowledge-bases`, `faqs`.

Changed
- `npm run spec-check` now loads every spec file GHL publishes (41 v2, 42 v3) instead of 14, checks v3 commands against the v3 spec, prefers literal paths over `{param}` paths when matching, and lists the v2 endpoints in use that v3 no longer has (`GET /contacts/`, `GET /users/`, `/emails/builder`).
- `contacts list` is labelled as deprecated by GHL; `contacts search` is the replacement.

## 2026.10.7

First public release.

- Checked against the GHL API snapshot of 2026-10-07 ([highlevel-api-docs@0af86a4](https://github.com/GoHighLevel/highlevel-api-docs/tree/0af86a4cbd48c66a4071c7e509d1079f9f10ed17), last changed 2026-06-19).
- 61 commands across locations, contacts, opportunities, conversations, calendars, payments, email templates, blogs, social posting, users, workflows and forms, plus `ghl api` for any other endpoint.
- Covers all 36 tools of the official hosted HighLevel MCP server.
- Named profiles for any number of sub-account and agency tokens, with multi-account read queries (`--profiles`, `--all-profiles`).
- Tokens kept in the macOS Keychain, libsecret on Linux, or an owner-only file.
- Claude Code plugin (`/plugin marketplace add WianB/ghl-cli`, then `/plugin install ghl@ghl-cli`) with a `ghl` skill, a generated command reference and recipes.
- `--yes` gate on anything that messages contacts, publishes, enrols workflows, books appointments or deletes; `--dry-run` on every write.

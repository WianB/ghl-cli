# Changelog

Versions are dates. Each release is built and checked against the GoHighLevel API as published on that date.

## 2026.10.7

First public release.

- Checked against the GHL API snapshot of 2026-10-07 ([highlevel-api-docs@0af86a4](https://github.com/GoHighLevel/highlevel-api-docs/tree/0af86a4cbd48c66a4071c7e509d1079f9f10ed17), last changed 2026-06-19).
- 61 commands across locations, contacts, opportunities, conversations, calendars, payments, email templates, blogs, social posting, users, workflows and forms, plus `ghl api` for any other endpoint.
- Covers all 36 tools of the official hosted HighLevel MCP server.
- Named profiles for any number of sub-account and agency tokens, with multi-account read queries (`--profiles`, `--all-profiles`).
- Tokens kept in the macOS Keychain, libsecret on Linux, or an owner-only file.
- `--yes` gate on anything that messages contacts, publishes, enrols workflows, books appointments or deletes; `--dry-run` on every write.

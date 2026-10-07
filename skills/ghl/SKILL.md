---
name: ghl
description: Work in GoHighLevel (HighLevel / LeadConnector) through the `ghl` command-line tool. Use whenever the user asks about GHL, HighLevel, sub-accounts, contacts, tags, pipelines, opportunities, conversations, SMS, email, calendars, appointments, workflows, forms, blogs, social posting, payments or invoices, for one client or several at once.
---

# GoHighLevel via the `ghl` CLI

The `ghl` command talks to the GoHighLevel API v2. It can hold many GHL accounts as named profiles, so several sub-accounts can be used in one session.

## Start of every GHL task

```bash
ghl auth list      # saved accounts, the default (*), and whether each token is present
```

If the account you need is missing, the user adds it in their own terminal. The token prompt is hidden, so the token never passes through the conversation:

```bash
ghl auth add <name> --location <locationId> --label "Client name"
ghl auth add <name> --agency --company <companyId>      # agency-level token
```

Never ask the user to paste a token into the chat, and never run `auth add` with a token yourself.

## Running commands

```bash
ghl [-p <profile>] <group> <command> [args] [options]
ghl -p acme contacts search --query "john"
ghl --profiles acme,globex opportunities search --status open   # read from several accounts
ghl --all-profiles locations get                                  # every sub-account profile
ghl <group>                       # list a group's commands
ghl <group> <command> --help      # usage for one command
ghl api GET /locations/{locationId}/tags                          # any endpoint without a command
```

Output is JSON. Groups: locations, contacts, opportunities, conversations, calendars, payments, emails, blogs, social, users, workflows, forms.

Extra fields: `--set key=value`, `--data '{...}'` or `--data @file.json`, and `-q key=value` for query parameters.

## Safety rules

- Sending SMS or email, workflow enrolment, booking appointments, publishing or scheduling blog posts, non-draft social posts and deletes refuse to run without `--yes`. Only add `--yes` when the user has explicitly asked for that exact action.
- Run the command with `--dry-run` first and show the user the request before sending anything to a real person.
- Multi-account runs are read-only. Write to one profile at a time and say which one.
- `contacts update --tag` replaces every tag on the contact. Use `tag-add` and `tag-remove` instead.
- Never print tokens.

## Troubleshooting

- `401 Invalid Private Integration token` or `Invalid JWT`: the token was revoked or is wrong. The user creates a new one in GHL (Settings, Private Integrations) and re-runs `ghl auth add <same name> ...`, which overwrites it.
- `not authorized for this scope`: add that scope to the Private Integration in GHL.
- `ghl auth test` checks every saved token at once.

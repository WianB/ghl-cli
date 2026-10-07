# ghl recipes

Command sequences for jobs that come up often. Response field names in the `jq` filters follow the GHL API docs; check them against real output the first time. Replace `acme` with the user's profile name and the IDs with real ones from earlier output.

## Find a contact and see everything about them

```bash
ghl -p acme contacts search --query "jane@example.com" --compact | jq '.contacts[] | {id, firstName, lastName, email, phone, tags}'
ghl -p acme contacts get <contactId>
ghl -p acme contacts notes <contactId>
ghl -p acme contacts tasks <contactId>
ghl -p acme opportunities search --contact <contactId>
ghl -p acme conversations search --contact <contactId>
```

## Pipeline report across every client

```bash
ghl --all-profiles opportunities search --status open --limit 100 --compact \
  | jq 'to_entries[] | {client: .key, open: (.value.meta.total // (.value.opportunities | length)), value: ([.value.opportunities[]?.monetaryValue // 0] | add)}'
```

A profile that fails (expired token, missing scope) shows up as `{"error": ...}` under its name instead of stopping the whole run. Report those to the user.

## Move a deal to the next stage

```bash
ghl -p acme opportunities pipelines --compact | jq '.pipelines[] | {id, name, stages: [.stages[] | {id, name}]}'
ghl -p acme opportunities update <opportunityId> --stage <stageId>
ghl -p acme opportunities status <opportunityId> --status won
```

## Add a lead with custom fields

```bash
ghl -p acme locations custom-fields --model contact --compact | jq '.customFields[] | {id, name, fieldKey}'
ghl -p acme contacts upsert --first Jane --last Doe --email jane@example.com --phone +61400000000 \
  --tag lead,website --source "website form" \
  --data '{"customFields":[{"id":"<fieldId>","fieldValue":"5000"}]}'
```

`upsert` matches an existing contact by email or phone instead of creating a duplicate.

## Reply to a contact (always dry-run first)

```bash
ghl -p acme conversations search --contact <contactId> --compact | jq '.conversations[0] | {id, lastMessageBody, lastMessageType}'
ghl -p acme conversations messages <conversationId> --limit 10
ghl -p acme conversations send --type SMS --contact <contactId> --message "Hi Jane, ..." --dry-run
# show the user the dry-run output and wait for a clear yes, then:
ghl -p acme conversations send --type SMS --contact <contactId> --message "Hi Jane, ..." --yes
```

For email use `--type Email --subject "..." --html "<p>...</p>"`.

## Check this week's appointments

```bash
ghl -p acme calendars list --compact | jq '.calendars[] | {id, name}'
ghl -p acme calendars events --calendar <calendarId> --start 2026-10-06 --end 2026-10-13
ghl -p acme calendars free-slots <calendarId> --start 2026-10-08 --end 2026-10-15 --timezone Australia/Brisbane
```

Dates can be plain dates, ISO times or epoch milliseconds.

## Agency overview (several agencies)

```bash
ghl --profiles agency-a,agency-b locations list --compact | jq 'to_entries[] | {agency: .key, subAccounts: [.value.locations[]? | {id, name}]}'
ghl --profiles agency-a,agency-b users search
```

Name agency profiles explicitly; `--all-profiles` only covers sub-account profiles.

## Recent payments

```bash
ghl -p acme payments transactions --start 2026-10-01 --end 2026-10-07 --limit 50
ghl -p acme payments invoices --status paid --limit 20
```

## Draft a blog post (no --yes needed for drafts)

```bash
ghl -p acme blogs sites
ghl -p acme blogs authors
ghl -p acme blogs categories
ghl -p acme blogs slug-check my-new-post
ghl -p acme blogs post-create --blog <blogId> --title "My new post" --slug my-new-post --status DRAFT \
  --html-file post.html --description "Short summary" --image https://example.com/hero.jpg --image-alt "Hero" \
  --author <authorId> --category <categoryId>
```

Publishing (`--status PUBLISHED` or `SCHEDULED`) needs the user's explicit go-ahead and `--yes`.

## Anything else

Find the endpoint in the GHL API docs (https://highlevel.stoplight.io/docs/integrations), then:

```bash
ghl -p acme api GET /locations/{locationId}/tags
ghl -p acme api POST /some/search/endpoint --read --data '{"locationId":"..."}'
```

# ghl command reference

Generated from ghl 2026.10.7 (GHL API snapshot 2026-10-07). Do not edit by hand; run `npm run skill-docs`.

Markers: **[--yes]** refuses to run without `--yes` (reaches real people, publishes, or deletes; may depend on the options given). **[write]** changes data, so it runs on one profile at a time. **[agency]** needs an agency profile.

Every command also takes the global options: `-p <profile>`, `--profiles a,b`, `--all-profiles` (reads only), `-l <locationId>`, `-q key=value`, `--set key=value`, `--data <json|@file>`, `--dry-run`, `--yes`, `--compact`.

## locations

- `ghl locations get`  
  Sub-account details
- `ghl locations custom-fields [--model contact|opportunity|all]`  
  Custom field definitions
- `ghl locations tags`  
  All contact tags in the sub-account
- `ghl locations list [--limit 100] [--skip 0] [--email x]`  
  All sub-accounts in the agency **[agency]**

## contacts

- `ghl contacts search [--query text] [--limit 20] [--page 1] [--data filters.json]`  
  Search contacts (name, email, phone)
- `ghl contacts list [--query text] [--limit 20] [--start-after-id id]`  
  List contacts (older endpoint, simple paging)
- `ghl contacts get <contactId>`  
  One contact
- `ghl contacts create [--first] [--last] [--email] [--phone] [--tag a,b] [--data custom.json]`  
  Create a contact **[write]**
- `ghl contacts update <contactId> [same flags as create]`  
  Update a contact (note: --tag replaces all tags) **[write]**
- `ghl contacts upsert [same flags as create]`  
  Create or update by email/phone match **[write]**
- `ghl contacts delete <contactId> --yes`  
  Delete a contact **[--yes]** **[write]**
- `ghl contacts tag-add <contactId> --tag a,b`  
  Add tags **[write]**
- `ghl contacts tag-remove <contactId> --tag a,b`  
  Remove tags **[write]**
- `ghl contacts tasks <contactId>`  
  Tasks on a contact
- `ghl contacts task-add <contactId> --title "Call back" --due 2026-10-10T09:00:00+10:00 [--body] [--assigned-to]`  
  Add a task **[write]**
- `ghl contacts notes <contactId>`  
  Notes on a contact
- `ghl contacts note-add <contactId> --body "Spoke today"`  
  Add a note **[write]**
- `ghl contacts workflow-add <contactId> --workflow <id> --yes`  
  Enrol in a workflow (it may message the contact) **[--yes]** **[write]**
- `ghl contacts workflow-remove <contactId> --workflow <id>`  
  Remove from a workflow **[write]**

## opportunities

- `ghl opportunities pipelines`  
  Pipelines and their stages
- `ghl opportunities search [--query] [--pipeline] [--stage] [--status open|won|lost|abandoned|all] [--contact] [--limit] [--page]`  
  Search deals
- `ghl opportunities get <opportunityId>`  
  One deal
- `ghl opportunities create --pipeline <id> --stage <id> --name "Deal" --contact <id> [--value 5000] [--status open]`  
  Create a deal **[write]**
- `ghl opportunities update <opportunityId> [--stage] [--pipeline] [--status] [--value] [--name] [--assigned-to]`  
  Update or move a deal **[write]**
- `ghl opportunities status <opportunityId> --status won|lost|open|abandoned`  
  Set deal status **[write]**
- `ghl opportunities delete <opportunityId> --yes`  
  Delete a deal **[--yes]** **[write]**

## users

- `ghl users list`  
  Users in the sub-account
- `ghl users search [--query text] [--limit 25]`  
  Users across the agency **[agency]**

## workflows

- `ghl workflows list`  
  Workflows in the sub-account

## forms

- `ghl forms list`  
  Forms in the sub-account
- `ghl forms submissions [--form <id>] [--limit 20] [--page 1] [--start 2026-10-01] [--end 2026-10-07]`  
  Form submissions

## conversations

- `ghl conversations search [--contact id] [--query text] [--status all|read|unread|starred|recents] [--limit 20] [--assigned-to id]`  
  Find conversations
- `ghl conversations messages <conversationId> [--limit 20] [--type TYPE_SMS,TYPE_EMAIL] [--last-message-id id]`  
  Messages in a conversation
- `ghl conversations send --type SMS|Email|WhatsApp|IG|FB|Custom|Live_Chat --contact <id> (--message text | --html "<p>..</p>") [--subject] [--schedule 2026-10-08T09:00:00+10:00] --yes`  
  Send a message to a real contact **[--yes]** **[write]**

## calendars

- `ghl calendars list`  
  Calendars in the sub-account
- `ghl calendars events --start 2026-10-01 --end 2026-10-08 (--calendar id | --user id | --group id)`  
  Appointments in a date range
- `ghl calendars free-slots <calendarId> --start 2026-10-08 --end 2026-10-15 [--timezone Australia/Brisbane]`  
  Open booking slots
- `ghl calendars appointment <eventId>`  
  One appointment
- `ghl calendars book --calendar <id> --contact <id> --start 2026-10-08T10:00:00+10:00 [--end ...] [--title] [--status confirmed] --yes`  
  Book an appointment (may notify the contact) **[--yes]** **[write]**
- `ghl calendars appointment-notes <appointmentId> [--limit 10] [--offset 0]`  
  Notes on an appointment

## payments

- `ghl payments transactions [--contact id] [--start 2026-10-01] [--end 2026-10-07] [--limit 20] [--offset 0] [--search text]`  
  Payment transactions
- `ghl payments orders [--contact id] [--limit 20] [--offset 0]`  
  Orders
- `ghl payments order <orderId>`  
  One order
- `ghl payments invoices [--status paid|sent|draft|...] [--limit 20] [--offset 0] [--contact id]`  
  Invoices
- `ghl payments invoice <invoiceId>`  
  One invoice
- `ghl payments products [--limit 20] [--offset 0] [--search text]`  
  Products

## emails

- `ghl emails templates [--search text] [--name] [--limit] [--offset] [--archived true]`  
  Email templates
- `ghl emails template-create --type html|builder|blank|folder|import --name "Welcome" [--title] [--parent id] [--import-provider mailchimp --import-url url]`  
  Create an email template **[write]**

## blogs

- `ghl blogs sites [--limit 10] [--skip 0] [--search text]`  
  Blog sites
- `ghl blogs posts --blog <id> [--status PUBLISHED|SCHEDULED|ARCHIVED|DRAFT] [--search text] [--limit 10] [--offset 0]`  
  Posts in a blog
- `ghl blogs authors [--limit 50] [--offset 0]`  
  Blog authors
- `ghl blogs categories [--limit 50] [--offset 0]`  
  Blog categories
- `ghl blogs slug-check <slug> [--post <postId>]`  
  Is a URL slug free?
- `ghl blogs post-create --blog <id> --title --slug --status DRAFT (--html "<p>..</p>" | --html-file post.html) --description --image url --image-alt --author <id> --category id,id --published-at 2026-10-08`  
  Create a blog post (PUBLISHED/SCHEDULED needs --yes) **[--yes]** **[write]**
- `ghl blogs post-update <postId> [same flags as post-create; GHL may require every field, not just the changed ones]`  
  Update a blog post (PUBLISHED/SCHEDULED needs --yes) **[--yes]** **[write]**

## social

- `ghl social accounts`  
  Connected social accounts
- `ghl social posts --from 2026-09-01 --to 2026-10-07 [--type all|scheduled|draft|published|failed] [--accounts id,id] [--limit 10] [--skip 0]`  
  Social posts in a date range
- `ghl social post <postId>`  
  One social post
- `ghl social post-create --account id,id --user <userId> --summary "text" [--type post|story|reel] [--status draft] [--media url,url] [--schedule 2026-10-08T09:00:00+10:00]`  
  Create a social post (non-draft needs --yes) **[--yes]** **[write]**
- `ghl social post-edit <postId> --type post [--summary] [--status] [--media] [--schedule]`  
  Edit a social post (non-draft needs --yes) **[--yes]** **[write]**
- `ghl social stats --profile-id id,id [--platform facebook,instagram]`  
  Last 7 days of social analytics

## api

- `ghl api <GET|POST|PUT|PATCH|DELETE> <path> [-q k=v] [--data <json|@file>] [--api-version 2021-04-15] [--read] [--yes]`  
  Any GHL v2 endpoint. `{locationId}` in the path is filled from the profile. Non-GET needs `--yes` unless `--read` marks it as a search. **[--yes]**

## auth

- `ghl auth list`: saved profiles, default marked `*`, whether each token is present
- `ghl auth test [name]`: check one or every saved token against GHL
- `ghl auth add <name> --location <id> [--label] | --agency --company <id>`: user runs this themselves; the token prompt is hidden
- `ghl auth default <name>` / `ghl auth remove <name>`

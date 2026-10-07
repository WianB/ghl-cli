// Generates the skill's command reference from the command registry, so the
// docs Claude reads can never drift from what the CLI actually accepts.
//
//   npm run skill-docs        rewrite plugins/ghl/skills/ghl/references/commands.md
//   (test/cli.test.ts fails if the committed file is out of date)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commands } from '../src/commands/index.ts';
import { API_SNAPSHOT, VERSION } from '../src/version.ts';

export const COMMANDS_MD = join(import.meta.dirname, '..', 'plugins', 'ghl', 'skills', 'ghl', 'references', 'commands.md');

export function renderCommands(): string {
  const lines: string[] = [
    '# ghl command reference',
    '',
    `Generated from ghl ${VERSION} (GHL API snapshot ${API_SNAPSHOT.date}). Do not edit by hand; run \`npm run skill-docs\`.`,
    '',
    'Markers: **[--yes]** refuses to run without `--yes` (reaches real people, publishes, or deletes; may depend on the options given). **[write]** changes data, so it runs on one profile at a time. **[agency]** needs an agency profile.',
    '',
    'Every command also takes the global options: `-p <profile>`, `--profiles a,b`, `--all-profiles` (reads only), `-l <locationId>`, `-q key=value`, `--set key=value`, `--data <json|@file>`, `--dry-run`, `--yes`, `--compact`.',
  ];
  for (const group of [...new Set(commands.map((c) => c.group))]) {
    lines.push('', `## ${group}`, '');
    for (const c of commands.filter((x) => x.group === group)) {
      const marks = [c.confirm ? '**[--yes]**' : '', c.write ? '**[write]**' : '', c.agency ? '**[agency]**' : ''].filter(Boolean).join(' ');
      lines.push(`- \`ghl ${c.group} ${c.name}${c.usage ? ' ' + c.usage : ''}\`  `, `  ${c.summary}${marks ? ' ' + marks : ''}`);
    }
  }
  lines.push(
    '',
    '## api',
    '',
    "- `ghl api <GET|POST|PUT|PATCH|DELETE> <path> [-q k=v] [--data <json|@file>] [--api-version 2021-04-15] [--read] [--yes]`  ",
    '  Any GHL v2 endpoint. `{locationId}` in the path is filled from the profile. Non-GET needs `--yes` unless `--read` marks it as a search. **[--yes]**',
    '',
    '## auth',
    '',
    '- `ghl auth list`: saved profiles, default marked `*`, whether each token is present',
    '- `ghl auth test [name]`: check one or every saved token against GHL',
    '- `ghl auth add <name> --location <id> [--label] | --agency --company <id>`: user runs this themselves; the token prompt is hidden',
    '- `ghl auth default <name>` / `ghl auth remove <name>`',
    '',
  );
  return lines.join('\n');
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('skill-docs.ts')) {
  writeFileSync(COMMANDS_MD, renderCommands());
  console.log(`wrote ${COMMANDS_MD}`);
}

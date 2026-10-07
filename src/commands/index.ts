import { comms } from './comms.ts';
import { content } from './content.ts';
import { crm } from './crm.ts';
import type { Cmd } from './types.ts';

export const commands: Cmd[] = [...crm, ...comms, ...content];

export function findCommand(group: string, name: string | undefined): Cmd | undefined {
  if (!name) return undefined;
  return commands.find((c) => c.group === group && c.name === name);
}

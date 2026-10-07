import { comms } from './comms.js';
import { content } from './content.js';
import { crm } from './crm.js';
export const commands = [...crm, ...comms, ...content];
export function findCommand(group, name) {
    if (!name)
        return undefined;
    return commands.find((c) => c.group === group && c.name === name);
}

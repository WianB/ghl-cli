import { comms } from './comms.js';
import { content } from './content.js';
import { crm } from './crm.js';
import { platform } from './platform.js';
export const commands = [...crm, ...comms, ...content, ...platform];
export function findCommand(group, name) {
    if (!name)
        return undefined;
    return commands.find((c) => c.group === group && c.name === name);
}

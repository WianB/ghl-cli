// Locations, contacts, opportunities, users, workflows, forms.
import { UsageError } from '../args.js';
import { arg, body, company, loc, query, req } from './types.js';
const CONTACT_FIELDS = {
    first: ['firstName'],
    last: ['lastName'],
    name: ['name'],
    email: ['email'],
    phone: ['phone'],
    company: ['companyName'],
    source: ['source'],
    tag: ['tags', 'l'],
    address: ['address1'],
    city: ['city'],
    state: ['state'],
    postal: ['postalCode'],
    country: ['country'],
    website: ['website'],
    timezone: ['timezone'],
    'assigned-to': ['assignedTo'],
};
const OPP_FIELDS = {
    name: ['name'],
    pipeline: ['pipelineId'],
    stage: ['pipelineStageId'],
    status: ['status'],
    value: ['monetaryValue', 'n'],
    contact: ['contactId'],
    'assigned-to': ['assignedTo'],
};
export const crm = [
    // ---- locations
    {
        group: 'locations', name: 'get', usage: '', summary: 'Sub-account details',
        replaces: ['locations_get-location'],
        run: (c) => req(c, 'GET', `/locations/${loc(c)}`),
    },
    {
        group: 'locations', name: 'custom-fields', usage: '[--model contact|opportunity|all]', summary: 'Custom field definitions',
        replaces: ['locations_get-custom-fields'],
        run: (c) => req(c, 'GET', `/locations/${loc(c)}/customFields`, { query: query(c, { model: ['model'] }) }),
    },
    {
        group: 'locations', name: 'tags', usage: '', summary: 'All contact tags in the sub-account',
        run: (c) => req(c, 'GET', `/locations/${loc(c)}/tags`),
    },
    {
        group: 'locations', name: 'list', usage: '[--limit 100] [--skip 0] [--email x]', summary: 'All sub-accounts in the agency', agency: true,
        run: (c) => req(c, 'GET', '/locations/search', {
            query: query(c, { limit: ['limit'], skip: ['skip'], email: ['email'], order: ['order'] }, { companyId: company(c), limit: 100 }),
        }),
    },
    // ---- contacts
    {
        group: 'contacts', name: 'search', usage: '[--query text] [--limit 20] [--page 1] [--data filters.json]', summary: 'Search contacts (name, email, phone)',
        run: (c) => req(c, 'POST', '/contacts/search', {
            read: true,
            body: body(c, { query: ['query'], limit: ['pageLimit', 'n'], page: ['page', 'n'] }, { locationId: loc(c), pageLimit: 20 }),
        }),
    },
    {
        group: 'contacts', name: 'list', usage: '[--query text] [--limit 20] [--start-after-id id]', summary: 'List contacts (older endpoint, simple paging)',
        replaces: ['contacts_get-contacts'],
        run: (c) => req(c, 'GET', '/contacts/', {
            query: query(c, { query: ['query'], limit: ['limit'], 'start-after': ['startAfter'], 'start-after-id': ['startAfterId'] }, { locationId: loc(c) }),
        }),
    },
    {
        group: 'contacts', name: 'get', usage: '<contactId>', summary: 'One contact',
        replaces: ['contacts_get-contact'],
        run: (c) => req(c, 'GET', `/contacts/${arg(c, 0, 'contactId')}`),
    },
    {
        group: 'contacts', name: 'create', usage: '[--first] [--last] [--email] [--phone] [--tag a,b] [--data custom.json]', summary: 'Create a contact', write: true,
        replaces: ['contacts_create-contact'],
        run: (c) => req(c, 'POST', '/contacts/', { body: body(c, CONTACT_FIELDS, { locationId: loc(c) }) }),
    },
    {
        group: 'contacts', name: 'update', usage: '<contactId> [same flags as create]', summary: 'Update a contact (note: --tag replaces all tags)', write: true,
        replaces: ['contacts_update-contact'],
        run: (c) => req(c, 'PUT', `/contacts/${arg(c, 0, 'contactId')}`, { body: body(c, CONTACT_FIELDS) }),
    },
    {
        group: 'contacts', name: 'upsert', usage: '[same flags as create]', summary: 'Create or update by email/phone match', write: true,
        replaces: ['contacts_upsert-contact'],
        run: (c) => req(c, 'POST', '/contacts/upsert', { body: body(c, CONTACT_FIELDS, { locationId: loc(c) }) }),
    },
    {
        group: 'contacts', name: 'delete', usage: '<contactId> --yes', summary: 'Delete a contact', write: true, confirm: true,
        run: (c) => req(c, 'DELETE', `/contacts/${arg(c, 0, 'contactId')}`),
    },
    {
        group: 'contacts', name: 'tag-add', usage: '<contactId> --tag a,b', summary: 'Add tags', write: true,
        replaces: ['contacts_add-tags'],
        run: (c) => req(c, 'POST', `/contacts/${arg(c, 0, 'contactId')}/tags`, { body: { tags: tags(c) } }),
    },
    {
        group: 'contacts', name: 'tag-remove', usage: '<contactId> --tag a,b', summary: 'Remove tags', write: true,
        replaces: ['contacts_remove-tags'],
        run: (c) => req(c, 'DELETE', `/contacts/${arg(c, 0, 'contactId')}/tags`, { body: { tags: tags(c) } }),
    },
    {
        group: 'contacts', name: 'tasks', usage: '<contactId>', summary: 'Tasks on a contact',
        replaces: ['contacts_get-all-tasks'],
        run: (c) => req(c, 'GET', `/contacts/${arg(c, 0, 'contactId')}/tasks`),
    },
    {
        group: 'contacts', name: 'task-add', usage: '<contactId> --title "Call back" --due 2026-10-10T09:00:00+10:00 [--body] [--assigned-to]', summary: 'Add a task', write: true,
        run: (c) => req(c, 'POST', `/contacts/${arg(c, 0, 'contactId')}/tasks`, {
            body: body(c, { title: ['title'], due: ['dueDate'], body: ['body'], 'assigned-to': ['assignedTo'], completed: ['completed', 'b'] }, { completed: false }),
        }),
    },
    {
        group: 'contacts', name: 'notes', usage: '<contactId>', summary: 'Notes on a contact',
        run: (c) => req(c, 'GET', `/contacts/${arg(c, 0, 'contactId')}/notes`),
    },
    {
        group: 'contacts', name: 'note-add', usage: '<contactId> --body "Spoke today"', summary: 'Add a note', write: true,
        run: (c) => req(c, 'POST', `/contacts/${arg(c, 0, 'contactId')}/notes`, { body: body(c, { body: ['body'], user: ['userId'] }) }),
    },
    {
        group: 'contacts', name: 'workflow-add', usage: '<contactId> --workflow <id> --yes', summary: 'Enrol in a workflow (it may message the contact)', write: true, confirm: true,
        run: (c) => req(c, 'POST', `/contacts/${arg(c, 0, 'contactId')}/workflow/${c.opt.need('workflow')}`, { body: body(c, { 'event-start': ['eventStartTime'] }) }),
    },
    {
        group: 'contacts', name: 'workflow-remove', usage: '<contactId> --workflow <id>', summary: 'Remove from a workflow', write: true,
        run: (c) => req(c, 'DELETE', `/contacts/${arg(c, 0, 'contactId')}/workflow/${c.opt.need('workflow')}`),
    },
    // ---- opportunities
    {
        group: 'opportunities', name: 'pipelines', usage: '', summary: 'Pipelines and their stages',
        replaces: ['opportunities_get-pipelines'],
        run: (c) => req(c, 'GET', '/opportunities/pipelines', { query: { locationId: loc(c) } }),
    },
    {
        group: 'opportunities', name: 'search', usage: '[--query] [--pipeline] [--stage] [--status open|won|lost|abandoned|all] [--contact] [--limit] [--page]', summary: 'Search deals',
        replaces: ['opportunities_search-opportunity'],
        run: (c) => req(c, 'GET', '/opportunities/search', {
            query: query(c, {
                query: ['q'], pipeline: ['pipeline_id'], stage: ['pipeline_stage_id'], status: ['status'], contact: ['contact_id'],
                'assigned-to': ['assigned_to'], limit: ['limit'], page: ['page'], date: ['date'], 'end-date': ['endDate'], order: ['order'],
            }, { location_id: loc(c) }),
        }),
    },
    {
        group: 'opportunities', name: 'get', usage: '<opportunityId>', summary: 'One deal',
        replaces: ['opportunities_get-opportunity'],
        run: (c) => req(c, 'GET', `/opportunities/${arg(c, 0, 'opportunityId')}`),
    },
    {
        group: 'opportunities', name: 'create', usage: '--pipeline <id> --stage <id> --name "Deal" --contact <id> [--value 5000] [--status open]', summary: 'Create a deal', write: true,
        run: (c) => req(c, 'POST', '/opportunities/', { body: body(c, OPP_FIELDS, { locationId: loc(c), status: 'open' }) }),
    },
    {
        group: 'opportunities', name: 'update', usage: '<opportunityId> [--stage] [--pipeline] [--status] [--value] [--name] [--assigned-to]', summary: 'Update or move a deal', write: true,
        replaces: ['opportunities_update-opportunity'],
        run: (c) => {
            const { contact: _contact, ...fields } = OPP_FIELDS;
            return req(c, 'PUT', `/opportunities/${arg(c, 0, 'opportunityId')}`, { body: body(c, fields) });
        },
    },
    {
        group: 'opportunities', name: 'status', usage: '<opportunityId> --status won|lost|open|abandoned', summary: 'Set deal status', write: true,
        run: (c) => req(c, 'PUT', `/opportunities/${arg(c, 0, 'opportunityId')}/status`, { body: { status: c.opt.need('status') } }),
    },
    {
        group: 'opportunities', name: 'delete', usage: '<opportunityId> --yes', summary: 'Delete a deal', write: true, confirm: true,
        run: (c) => req(c, 'DELETE', `/opportunities/${arg(c, 0, 'opportunityId')}`),
    },
    // ---- users, workflows, forms
    {
        group: 'users', name: 'list', usage: '', summary: 'Users in the sub-account',
        run: (c) => req(c, 'GET', '/users/', { query: { locationId: loc(c) } }),
    },
    {
        group: 'users', name: 'search', usage: '[--query text] [--limit 25]', summary: 'Users across the agency', agency: true,
        run: (c) => req(c, 'GET', '/users/search', { query: query(c, { query: ['query'], limit: ['limit'], skip: ['skip'] }, { companyId: company(c) }) }),
    },
    {
        group: 'workflows', name: 'list', usage: '', summary: 'Workflows in the sub-account',
        run: (c) => req(c, 'GET', '/workflows/', { query: { locationId: loc(c) } }),
    },
    {
        group: 'forms', name: 'list', usage: '', summary: 'Forms in the sub-account',
        run: (c) => req(c, 'GET', '/forms/', { query: { locationId: loc(c) } }),
    },
    {
        group: 'forms', name: 'submissions', usage: '[--form <id>] [--limit 20] [--page 1] [--start 2026-10-01] [--end 2026-10-07]', summary: 'Form submissions',
        run: (c) => req(c, 'GET', '/forms/submissions', {
            query: query(c, { form: ['formId'], limit: ['limit'], page: ['page'], start: ['startAt'], end: ['endAt'], query: ['q'] }, { locationId: loc(c) }),
        }),
    },
];
function tags(c) {
    const t = c.opt.list('tag');
    if (!t?.length)
        throw new UsageError('Pass --tag a,b');
    return t;
}

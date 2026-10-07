// Conversations, calendars, payments.
import { UsageError } from '../args.js';
import { CALENDAR_VERSION, CONVERSATIONS_VERSION } from '../client.js';
import { arg, body, loc, query, req, toIso, toMillis } from './types.js';
const MESSAGE_TYPES = ['SMS', 'Email', 'WhatsApp', 'IG', 'FB', 'Custom', 'Live_Chat'];
export const comms = [
    // ---- conversations
    {
        group: 'conversations', name: 'search', usage: '[--contact id] [--query text] [--status all|read|unread|starred|recents] [--limit 20] [--assigned-to id]', summary: 'Find conversations',
        replaces: ['conversations_search-conversation'],
        run: (c) => req(c, 'GET', '/conversations/search', {
            version: CONVERSATIONS_VERSION,
            query: query(c, {
                contact: ['contactId'], query: ['query'], status: ['status'], limit: ['limit'], 'assigned-to': ['assignedTo'],
                sort: ['sort'], 'sort-by': ['sortBy'], 'last-message-type': ['lastMessageType'], 'last-message-direction': ['lastMessageDirection'],
                'start-after-date': ['startAfterDate'], id: ['id'],
            }, { locationId: loc(c) }),
        }),
    },
    {
        group: 'conversations', name: 'messages', usage: '<conversationId> [--limit 20] [--type TYPE_SMS,TYPE_EMAIL] [--last-message-id id]', summary: 'Messages in a conversation',
        replaces: ['conversations_get-messages'],
        run: (c) => req(c, 'GET', `/conversations/${arg(c, 0, 'conversationId')}/messages`, {
            version: CONVERSATIONS_VERSION,
            query: query(c, { limit: ['limit'], type: ['type'], 'last-message-id': ['lastMessageId'] }),
        }),
    },
    {
        group: 'conversations', name: 'send', usage: '--type SMS|Email|WhatsApp|IG|FB|Custom|Live_Chat --contact <id> (--message text | --html "<p>..</p>") [--subject] [--schedule 2026-10-08T09:00:00+10:00] --yes', summary: 'Send a message to a real contact', write: true, confirm: true,
        replaces: ['conversations_send-a-new-message'],
        run: (c) => {
            const type = c.opt.need('type');
            if (!MESSAGE_TYPES.includes(type))
                throw new UsageError(`--type must be one of ${MESSAGE_TYPES.join(', ')}`);
            const b = body(c, {
                contact: ['contactId'], message: ['message'], html: ['html'], subject: ['subject'], attachment: ['attachments', 'l'],
                'email-from': ['emailFrom'], 'email-to': ['emailTo'], cc: ['emailCc', 'l'], bcc: ['emailBcc', 'l'], 'reply-mode': ['emailReplyMode'],
                'from-number': ['fromNumber'], 'to-number': ['toNumber'], template: ['templateId'], 'reply-to': ['replyMessageId'], thread: ['threadId'],
                appointment: ['appointmentId'], provider: ['conversationProviderId'],
            }, { type });
            if (!b.contactId)
                throw new UsageError('Missing required option --contact');
            const when = c.opt.str('schedule');
            if (when)
                b.scheduledTimestamp = Math.floor(toMillis(when) / 1000);
            return req(c, 'POST', '/conversations/messages', { body: b, version: CONVERSATIONS_VERSION });
        },
    },
    // ---- calendars
    {
        group: 'calendars', name: 'list', usage: '', summary: 'Calendars in the sub-account',
        run: (c) => req(c, 'GET', '/calendars/', { query: { locationId: loc(c) }, version: CALENDAR_VERSION }),
    },
    {
        group: 'calendars', name: 'events', usage: '--start 2026-10-01 --end 2026-10-08 (--calendar id | --user id | --group id)', summary: 'Appointments in a date range',
        replaces: ['calendars_get-calendar-events'],
        run: (c) => {
            if (!['calendar', 'user', 'group'].some((f) => c.opt.has(f)))
                throw new UsageError('Pass one of --calendar, --user, --group');
            return req(c, 'GET', '/calendars/events', {
                version: CALENDAR_VERSION,
                query: query(c, { calendar: ['calendarId'], user: ['userId'], group: ['groupId'] }, {
                    locationId: loc(c), startTime: toMillis(c.opt.need('start')), endTime: toMillis(c.opt.need('end')),
                }),
            });
        },
    },
    {
        group: 'calendars', name: 'free-slots', usage: '<calendarId> --start 2026-10-08 --end 2026-10-15 [--timezone Australia/Brisbane]', summary: 'Open booking slots',
        run: (c) => req(c, 'GET', `/calendars/${arg(c, 0, 'calendarId')}/free-slots`, {
            version: CALENDAR_VERSION,
            query: query(c, { timezone: ['timezone'], user: ['userId'] }, { startDate: toMillis(c.opt.need('start')), endDate: toMillis(c.opt.need('end')) }),
        }),
    },
    {
        group: 'calendars', name: 'appointment', usage: '<eventId>', summary: 'One appointment',
        run: (c) => req(c, 'GET', `/calendars/events/appointments/${arg(c, 0, 'eventId')}`, { version: CALENDAR_VERSION }),
    },
    {
        group: 'calendars', name: 'book', usage: '--calendar <id> --contact <id> --start 2026-10-08T10:00:00+10:00 [--end ...] [--title] [--status confirmed] --yes', summary: 'Book an appointment (may notify the contact)', write: true, confirm: true,
        run: (c) => {
            const b = body(c, { calendar: ['calendarId'], contact: ['contactId'], title: ['title'], status: ['appointmentStatus'], 'assigned-to': ['assignedUserId'], address: ['address'] }, { locationId: loc(c) });
            b.startTime = toIso(c.opt.need('start'));
            const end = c.opt.str('end');
            if (end)
                b.endTime = toIso(end);
            if (!b.calendarId || !b.contactId)
                throw new UsageError('Pass --calendar and --contact');
            return req(c, 'POST', '/calendars/events/appointments', { body: b, version: CALENDAR_VERSION });
        },
    },
    {
        group: 'calendars', name: 'appointment-notes', usage: '<appointmentId> [--limit 10] [--offset 0]', summary: 'Notes on an appointment',
        replaces: ['calendars_get-appointment-notes'],
        run: (c) => req(c, 'GET', `/calendars/appointments/${arg(c, 0, 'appointmentId')}/notes`, {
            version: CALENDAR_VERSION,
            query: query(c, { limit: ['limit'], offset: ['offset'] }, { limit: 10, offset: 0 }),
        }),
    },
    // ---- payments
    {
        group: 'payments', name: 'transactions', usage: '[--contact id] [--start 2026-10-01] [--end 2026-10-07] [--limit 20] [--offset 0] [--search text]', summary: 'Payment transactions',
        replaces: ['payments_list-transactions'],
        run: (c) => req(c, 'GET', '/payments/transactions', {
            query: query(c, {
                contact: ['contactId'], start: ['startAt'], end: ['endAt'], limit: ['limit'], offset: ['offset'], search: ['search'],
                mode: ['paymentMode'], subscription: ['subscriptionId'], entity: ['entityId'], 'source-type': ['entitySourceType'], 'source-sub-type': ['entitySourceSubType'],
            }, { altId: loc(c), altType: 'location' }),
        }),
    },
    {
        group: 'payments', name: 'orders', usage: '[--contact id] [--limit 20] [--offset 0]', summary: 'Orders',
        run: (c) => req(c, 'GET', '/payments/orders', {
            query: query(c, { contact: ['contactId'], limit: ['limit'], offset: ['offset'], status: ['status'], search: ['search'], 'payment-status': ['paymentStatus'], start: ['startAt'], end: ['endAt'] }, { altId: loc(c), locationId: loc(c) }),
        }),
    },
    {
        group: 'payments', name: 'order', usage: '<orderId>', summary: 'One order',
        replaces: ['payments_get-order-by-id'],
        run: (c) => req(c, 'GET', `/payments/orders/${arg(c, 0, 'orderId')}`, { query: { altId: loc(c), locationId: loc(c) } }),
    },
    {
        group: 'payments', name: 'invoices', usage: '[--status paid|sent|draft|...] [--limit 20] [--offset 0] [--contact id]', summary: 'Invoices',
        run: (c) => req(c, 'GET', '/invoices/', {
            query: query(c, { status: ['status'], limit: ['limit'], offset: ['offset'], contact: ['contactId'], search: ['search'] }, { altId: loc(c), altType: 'location', limit: 20, offset: 0 }),
        }),
    },
    {
        group: 'payments', name: 'invoice', usage: '<invoiceId>', summary: 'One invoice',
        run: (c) => req(c, 'GET', `/invoices/${arg(c, 0, 'invoiceId')}`, { query: { altId: loc(c), altType: 'location' } }),
    },
    {
        group: 'payments', name: 'products', usage: '[--limit 20] [--offset 0] [--search text]', summary: 'Products',
        run: (c) => req(c, 'GET', '/products/', { query: query(c, { limit: ['limit'], offset: ['offset'], search: ['search'] }, { locationId: loc(c) }) }),
    },
];

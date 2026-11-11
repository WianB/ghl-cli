// Media library, custom values, custom objects, Voice AI, Conversation AI, knowledge bases.

import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';
import { UsageError } from '../args.ts';
import { AI_VERSION } from '../client.ts';
import type { Cmd, Ctx } from './types.ts';
import { arg, body, loc, query, req, toMillis } from './types.ts';

// `--prop key=value` (repeatable) builds a custom object record's properties.
function props(c: Ctx): Record<string, string> | undefined {
  const raw = c.opt.raw('prop');
  if (!raw.length) return undefined;
  const out: Record<string, string> = {};
  for (const kv of raw) {
    const i = kv.indexOf('=');
    if (i < 1) throw new UsageError(`--prop expects key=value, got "${kv}"`);
    out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

async function uploadForm(c: Ctx): Promise<FormData> {
  const form = new FormData();
  const url = c.opt.str('url');
  const name = c.opt.str('name');
  if (url) {
    form.set('hosted', 'true');
    form.set('fileUrl', url);
  } else {
    const file = arg(c, 0, 'file');
    let blob: Blob;
    try {
      blob = await openAsBlob(file);
    } catch {
      throw new UsageError(`Cannot read file "${file}"`);
    }
    form.set('hosted', 'false');
    form.set('file', blob, basename(file));
  }
  if (name) form.set('name', name);
  const folder = c.opt.str('folder');
  if (folder) form.set('parentId', folder);
  return form;
}

export const platform: Cmd[] = [
  // ---- media library
  {
    group: 'media', name: 'list', usage: '[--type file|folder] [--query text] [--folder id] [--limit 20] [--offset 0] [--sort-by createdAt] [--sort-order desc]', summary: 'Files and folders in the media library',
    run: (c) => req(c, 'GET', '/medias/files', {
      query: query(c, {
        type: ['type'], query: ['query'], folder: ['parentId'], limit: ['limit'], offset: ['offset'], 'sort-by': ['sortBy'], 'sort-order': ['sortOrder'],
      }, { altId: loc(c), altType: 'location', type: 'file', sortBy: 'createdAt', sortOrder: 'desc', limit: 20, offset: 0 }),
    }),
  },
  {
    group: 'media', name: 'upload', usage: '<file> | --url https://... [--name "Display name"] [--folder id]', summary: 'Upload a file (or import one from a URL) to the media library', write: true,
    run: async (c) => req(c, 'POST', '/medias/upload-file', { form: await uploadForm(c) }),
  },
  {
    group: 'media', name: 'folder-create', usage: '--name "Ads" [--folder parentId]', summary: 'Create a media folder', write: true,
    run: (c) => req(c, 'POST', '/medias/folder', { body: body(c, { name: ['name'], folder: ['parentId'] }, { altId: loc(c), altType: 'location', name: c.opt.need('name') }) }),
  },
  {
    group: 'media', name: 'delete', usage: '<fileId> --yes', summary: 'Delete a media file or folder', write: true, confirm: true,
    run: (c) => req(c, 'DELETE', `/medias/${arg(c, 0, 'fileId')}`, { query: { altId: loc(c), altType: 'location' } }),
  },

  // ---- custom values (merge fields like {{custom_values.booking_link}})
  {
    group: 'locations', name: 'custom-values', usage: '', summary: 'Custom values (account-wide merge fields)',
    run: (c) => req(c, 'GET', `/locations/${loc(c)}/customValues`),
  },
  {
    group: 'locations', name: 'custom-value-create', usage: '--name "Booking link" --value https://...', summary: 'Create a custom value', write: true,
    run: (c) => req(c, 'POST', `/locations/${loc(c)}/customValues`, { body: body(c, {}, { name: c.opt.need('name'), value: c.opt.need('value') }) }),
  },
  {
    group: 'locations', name: 'custom-value-update', usage: '<id> --name "Booking link" --value https://...', summary: 'Change a custom value; every live email, page and workflow using it changes too (GHL needs both name and value)', write: true, confirm: true,
    run: (c) => req(c, 'PUT', `/locations/${loc(c)}/customValues/${arg(c, 0, 'id')}`, { body: body(c, {}, { name: c.opt.need('name'), value: c.opt.need('value') }) }),
  },
  {
    group: 'locations', name: 'custom-value-delete', usage: '<id> --yes', summary: 'Delete a custom value', write: true, confirm: true,
    run: (c) => req(c, 'DELETE', `/locations/${loc(c)}/customValues/${arg(c, 0, 'id')}`),
  },

  // ---- custom objects
  {
    group: 'objects', name: 'list', usage: '', summary: 'Object schemas (standard and custom)',
    run: (c) => req(c, 'GET', '/objects/', { query: { locationId: loc(c) } }),
  },
  {
    group: 'objects', name: 'get', usage: '<schemaKey> [--fields true]', summary: 'One object schema, optionally with its fields',
    run: (c) => req(c, 'GET', `/objects/${arg(c, 0, 'schemaKey')}`, { query: query(c, { fields: ['fetchProperties'] }, { locationId: loc(c) }) }),
  },
  {
    group: 'objects', name: 'search', usage: '<schemaKey> [--query text] [--limit 20] [--page 1]', summary: 'Search records of an object',
    run: (c) => req(c, 'POST', `/objects/${arg(c, 0, 'schemaKey')}/records/search`, {
      read: true,
      body: body(c, { query: ['query'], limit: ['pageLimit', 'n'], page: ['page', 'n'] }, { locationId: loc(c), page: 1, pageLimit: 20, query: '', searchAfter: [] }),
    }),
  },
  {
    group: 'objects', name: 'record', usage: '<schemaKey> <recordId>', summary: 'One record',
    run: (c) => req(c, 'GET', `/objects/${arg(c, 0, 'schemaKey')}/records/${arg(c, 1, 'recordId')}`),
  },
  {
    group: 'objects', name: 'record-create', usage: '<schemaKey> --prop key=value [--prop ...] [--data record.json]', summary: 'Create a record', write: true,
    run: (c) => {
      const b = body(c, {}, { locationId: loc(c) });
      const p = props(c);
      if (p) b.properties = { ...(b.properties as object), ...p };
      return req(c, 'POST', `/objects/${arg(c, 0, 'schemaKey')}/records`, { body: b });
    },
  },
  {
    group: 'objects', name: 'record-update', usage: '<schemaKey> <recordId> --prop key=value [--data record.json]', summary: 'Update a record', write: true,
    run: (c) => {
      const b = body(c, {});
      const p = props(c);
      if (p) b.properties = { ...(b.properties as object), ...p };
      return req(c, 'PUT', `/objects/${arg(c, 0, 'schemaKey')}/records/${arg(c, 1, 'recordId')}`, { query: { locationId: loc(c) }, body: b });
    },
  },
  {
    group: 'objects', name: 'record-delete', usage: '<schemaKey> <recordId> --yes', summary: 'Delete a record', write: true, confirm: true,
    run: (c) => req(c, 'DELETE', `/objects/${arg(c, 0, 'schemaKey')}/records/${arg(c, 1, 'recordId')}`),
  },

  // ---- Voice AI
  {
    group: 'voice', name: 'agents', usage: '[--query text] [--page 1] [--page-size 10]', summary: 'Voice AI agents',
    run: (c) => req(c, 'GET', '/voice-ai/agents', { version: AI_VERSION, query: query(c, { query: ['query'], page: ['page'], 'page-size': ['pageSize'] }, { locationId: loc(c) }) }),
  },
  {
    group: 'voice', name: 'agent', usage: '<agentId>', summary: 'One Voice AI agent (prompt, voice, actions)',
    run: (c) => req(c, 'GET', `/voice-ai/agents/${arg(c, 0, 'agentId')}`, { version: AI_VERSION, query: { locationId: loc(c) } }),
  },
  {
    group: 'voice', name: 'calls', usage: '[--agent id] [--contact id] [--start 2026-11-01] [--end 2026-11-08] [--call-type LIVE|TRIAL] [--page 1] [--page-size 10]', summary: 'Voice AI call logs',
    run: (c) => {
      const q = query(c, { agent: ['agentId'], contact: ['contactId'], 'call-type': ['callType'], 'action-type': ['actionType'], 'sort-by': ['sortBy'], sort: ['sort'], page: ['page'], 'page-size': ['pageSize'] }, { locationId: loc(c) });
      const start = c.opt.str('start');
      const end = c.opt.str('end');
      if (start) q.startDate = toMillis(start);
      if (end) q.endDate = toMillis(end);
      return req(c, 'GET', '/voice-ai/dashboard/call-logs', { version: AI_VERSION, query: q });
    },
  },
  {
    group: 'voice', name: 'call', usage: '<callId>', summary: 'One call log with transcript and summary',
    run: (c) => req(c, 'GET', `/voice-ai/dashboard/call-logs/${arg(c, 0, 'callId')}`, { version: AI_VERSION, query: { locationId: loc(c) } }),
  },

  // ---- Conversation AI and knowledge bases
  {
    group: 'ai', name: 'agents', usage: '[--query text] [--limit 20] [--start-after id]', summary: 'Conversation AI (chat) agents for the token\'s sub-account',
    run: (c) => req(c, 'GET', '/conversation-ai/agents/search', { version: AI_VERSION, query: query(c, { query: ['query'], limit: ['limit'], 'start-after': ['startAfter'] }) }),
  },
  {
    group: 'ai', name: 'knowledge-bases', usage: '[--query text] [--limit 20]', summary: 'Knowledge bases used by the AI agents',
    run: (c) => req(c, 'GET', '/knowledge-bases/', { version: AI_VERSION, query: query(c, { query: ['query'], limit: ['limit'], 'start-after': ['lastKnowledgeBaseId'] }, { locationId: loc(c) }) }),
  },
  {
    group: 'ai', name: 'faqs', usage: '<knowledgeBaseId> [--limit 20]', summary: 'FAQs in a knowledge base',
    run: (c) => req(c, 'GET', '/knowledge-bases/faqs', { version: AI_VERSION, query: query(c, { limit: ['limit'], 'start-after': ['lastFaqId'] }, { locationId: loc(c), knowledgeBaseId: arg(c, 0, 'knowledgeBaseId') }) }),
  },
];

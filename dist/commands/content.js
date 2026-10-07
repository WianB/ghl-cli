// Email templates, blogs, social media posting.
import { readFileSync } from 'node:fs';
import { UsageError } from '../args.js';
import { arg, body, loc, query, req, toIso } from './types.js';
const BLOG_FIELDS = {
    blog: ['blogId'],
    title: ['title'],
    slug: ['urlSlug'],
    status: ['status'],
    html: ['rawHTML'],
    description: ['description'],
    image: ['imageUrl'],
    'image-alt': ['imageAltText'],
    author: ['author'],
    category: ['categories', 'l'],
    tag: ['tags', 'l'],
    canonical: ['canonicalLink'],
};
function blogBody(c, base = {}) {
    const b = body(c, BLOG_FIELDS, base);
    const file = c.opt.str('html-file');
    if (file)
        b.rawHTML = readFileSync(file, 'utf8');
    const at = c.opt.str('published-at');
    if (at)
        b.publishedAt = toIso(at);
    if (b.status)
        b.status = String(b.status).toUpperCase();
    return b;
}
// Publishing or scheduling puts content in front of the public.
const blogGoesLive = (c) => ['PUBLISHED', 'SCHEDULED'].includes((c.opt.str('status') ?? '').toUpperCase());
const SOCIAL_FIELDS = {
    account: ['accountIds', 'l'],
    user: ['userId'],
    summary: ['summary'],
    type: ['type'],
    status: ['status'],
    category: ['categoryId'],
    tag: ['tags', 'l'],
    'follow-up': ['followUpComment'],
};
function socialBody(c, base = {}) {
    const b = body(c, SOCIAL_FIELDS, base);
    const media = c.opt.list('media');
    if (media)
        b.media = media.map((url) => ({ url }));
    const when = c.opt.str('schedule');
    if (when) {
        b.scheduleDate = toIso(when);
        b.scheduleTimeUpdated = true;
    }
    return b;
}
// Anything other than a draft can go out to a live social account.
const socialGoesLive = (c) => c.opt.has('status') && c.opt.str('status') !== 'draft';
export const content = [
    // ---- email templates
    {
        group: 'emails', name: 'templates', usage: '[--search text] [--name] [--limit] [--offset] [--archived true]', summary: 'Email templates',
        replaces: ['emails_fetch-template'],
        run: (c) => req(c, 'GET', '/emails/builder', {
            query: query(c, {
                search: ['search'], name: ['name'], limit: ['limit'], offset: ['offset'], archived: ['archived'], parent: ['parentId'],
                'builder-version': ['builderVersion'], 'sort-by-date': ['sortByDate'], 'templates-only': ['templatesOnly'], origin: ['originId'],
            }, { locationId: loc(c) }),
        }),
    },
    {
        group: 'emails', name: 'template-create', usage: '--type html|builder|blank|folder|import --name "Welcome" [--title] [--parent id] [--import-provider mailchimp --import-url url]', summary: 'Create an email template', write: true,
        replaces: ['emails_create-template'],
        run: (c) => req(c, 'POST', '/emails/builder', {
            body: body(c, {
                type: ['type'], name: ['name'], title: ['title'], parent: ['parentId'], 'builder-version': ['builderVersion'],
                'import-provider': ['importProvider'], 'import-url': ['importURL'], 'plain-text': ['isPlainText', 'b'], source: ['templateSource'],
                'data-url': ['templateDataUrl'], 'updated-by': ['updatedBy'],
            }, { locationId: loc(c) }),
        }),
    },
    // ---- blogs
    {
        group: 'blogs', name: 'sites', usage: '[--limit 10] [--skip 0] [--search text]', summary: 'Blog sites',
        replaces: ['blogs_get-blogs'],
        run: (c) => req(c, 'GET', '/blogs/site/all', { query: query(c, { limit: ['limit'], skip: ['skip'], search: ['searchTerm'] }, { locationId: loc(c), skip: 0, limit: 10 }) }),
    },
    {
        group: 'blogs', name: 'posts', usage: '--blog <id> [--status PUBLISHED|SCHEDULED|ARCHIVED|DRAFT] [--search text] [--limit 10] [--offset 0]', summary: 'Posts in a blog',
        replaces: ['blogs_get-blog-post'],
        run: (c) => req(c, 'GET', '/blogs/posts/all', {
            query: query(c, { status: ['status'], search: ['searchTerm'], limit: ['limit'], offset: ['offset'] }, { locationId: loc(c), blogId: c.opt.need('blog'), limit: 10, offset: 0 }),
        }),
    },
    {
        group: 'blogs', name: 'authors', usage: '[--limit 50] [--offset 0]', summary: 'Blog authors',
        replaces: ['blogs_get-all-blog-authors-by-location'],
        run: (c) => req(c, 'GET', '/blogs/authors', { query: query(c, { limit: ['limit'], offset: ['offset'] }, { locationId: loc(c), limit: 50, offset: 0 }) }),
    },
    {
        group: 'blogs', name: 'categories', usage: '[--limit 50] [--offset 0]', summary: 'Blog categories',
        replaces: ['blogs_get-all-categories-by-location'],
        run: (c) => req(c, 'GET', '/blogs/categories', { query: query(c, { limit: ['limit'], offset: ['offset'] }, { locationId: loc(c), limit: 50, offset: 0 }) }),
    },
    {
        group: 'blogs', name: 'slug-check', usage: '<slug> [--post <postId>]', summary: 'Is a URL slug free?',
        replaces: ['blogs_check-url-slug-exists'],
        run: (c) => req(c, 'GET', '/blogs/posts/url-slug-exists', { query: query(c, { post: ['postId'] }, { locationId: loc(c), urlSlug: arg(c, 0, 'slug') }) }),
    },
    {
        group: 'blogs', name: 'post-create', usage: '--blog <id> --title --slug --status DRAFT (--html "<p>..</p>" | --html-file post.html) --description --image url --image-alt --author <id> --category id,id --published-at 2026-10-08', summary: 'Create a blog post (PUBLISHED/SCHEDULED needs --yes)', write: true, confirm: blogGoesLive,
        replaces: ['blogs_create-blog-post'],
        run: (c) => {
            const b = blogBody(c, { locationId: loc(c) });
            b.publishedAt ??= new Date().toISOString();
            const missing = ['blogId', 'title', 'urlSlug', 'status', 'rawHTML'].filter((k) => !b[k]);
            if (missing.length)
                throw new UsageError(`Missing: ${missing.join(', ')}`);
            return req(c, 'POST', '/blogs/posts', { body: b });
        },
    },
    {
        group: 'blogs', name: 'post-update', usage: '<postId> [same flags as post-create; GHL may require every field, not just the changed ones]', summary: 'Update a blog post (PUBLISHED/SCHEDULED needs --yes)', write: true, confirm: blogGoesLive,
        replaces: ['blogs_update-blog-post'],
        run: (c) => req(c, 'PUT', `/blogs/posts/${arg(c, 0, 'postId')}`, { body: blogBody(c, { locationId: loc(c) }) }),
    },
    // ---- social media posting
    {
        group: 'social', name: 'accounts', usage: '', summary: 'Connected social accounts',
        replaces: ['social-media-posting_get-account'],
        run: (c) => req(c, 'GET', `/social-media-posting/${loc(c)}/accounts`),
    },
    {
        group: 'social', name: 'posts', usage: '--from 2026-09-01 --to 2026-10-07 [--type all|scheduled|draft|published|failed] [--accounts id,id] [--limit 10] [--skip 0]', summary: 'Social posts in a date range',
        replaces: ['social-media-posting_get-posts'],
        run: (c) => req(c, 'POST', `/social-media-posting/${loc(c)}/posts/list`, {
            read: true,
            body: body(c, { type: ['type'], accounts: ['accounts'], 'post-type': ['postType'], limit: ['limit'], skip: ['skip'] }, {
                type: 'all', skip: '0', limit: '10', includeUsers: c.opt.bool('include-users') ? 'true' : 'false',
                fromDate: toIso(c.opt.need('from')), toDate: toIso(c.opt.need('to')),
            }),
        }),
    },
    {
        group: 'social', name: 'post', usage: '<postId>', summary: 'One social post',
        replaces: ['social-media-posting_get-post'],
        run: (c) => req(c, 'GET', `/social-media-posting/${loc(c)}/posts/${arg(c, 0, 'postId')}`),
    },
    {
        group: 'social', name: 'post-create', usage: '--account id,id --user <userId> --summary "text" [--type post|story|reel] [--status draft] [--media url,url] [--schedule 2026-10-08T09:00:00+10:00]', summary: 'Create a social post (non-draft needs --yes)', write: true, confirm: socialGoesLive,
        replaces: ['social-media-posting_create-post'],
        run: (c) => {
            const b = socialBody(c, { type: 'post', status: 'draft' });
            if (!b.accountIds || !b.userId)
                throw new UsageError('Pass --account and --user');
            return req(c, 'POST', `/social-media-posting/${loc(c)}/posts`, { body: b });
        },
    },
    {
        group: 'social', name: 'post-edit', usage: '<postId> --type post [--summary] [--status] [--media] [--schedule]', summary: 'Edit a social post (non-draft needs --yes)', write: true, confirm: socialGoesLive,
        replaces: ['social-media-posting_edit-post'],
        run: (c) => req(c, 'PUT', `/social-media-posting/${loc(c)}/posts/${arg(c, 0, 'postId')}`, { body: socialBody(c, { type: 'post' }) }),
    },
    {
        group: 'social', name: 'stats', usage: '--profile-id id,id [--platform facebook,instagram]', summary: 'Last 7 days of social analytics',
        replaces: ['social-media-posting_get-social-media-statistics'],
        run: (c) => req(c, 'POST', '/social-media-posting/statistics', {
            read: true,
            query: { locationId: loc(c) },
            body: body(c, { 'profile-id': ['profileIds', 'l'], platform: ['platforms', 'l'] }),
        }),
    },
];

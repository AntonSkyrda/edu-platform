# Edu Platform Admin

React/Vite SPA for administrators and managers.

## Development

Run `pnpm install` from the repository root. Set `VITE_API_URL=http://localhost:3000`
in the root `.env`, then run `pnpm dev:admin`. The admin uses port 3001.
The API must allow that exact origin with credentials. VITE variables are public
build-time settings; never prefix backend secrets with VITE_.

## Architecture

- `app`: composition, providers, routes and router context.
- `features`: business functionality, API functions, queries, forms and pages.
- `shared`: generic UI, HTTP transport, error normalization and configuration.
- `@project/contracts`: shared request/response types and public constants.

Features expose their public API through index.ts. Shared code never imports app
or features. Database code must never enter the browser bundle. Auth tokens remain
in HttpOnly cookies. QueryClient is shared by the React provider and route loaders.
Generated routeTree.gen.ts is committed and excluded from lint/formatting.

## Checks

`pnpm --filter admin build` runs TypeScript and the production build.
`pnpm exec eslint apps/admin/src apps/admin/vite.config.ts` uses the root config.
For production hosting, rewrite non-asset SPA routes to index.html.

## Authentication

- `/login`: cookie sign-in; `/`: protected overview.
- `/users`: ADMIN-only user list, invitations, resend, block and unblock.
- `/accept-invitation#token=...`: activate an invited account and set a password.
- `/forgot-password`: generic recovery confirmation, regardless of account eligibility.
- `/reset-password#token=...`: reset password; all sessions are revoked by the API.
- ADMIN and MANAGER can use the admin application. Other roles see access denied.

Email link tokens are captured in memory and removed from the URL. Reloading a
password page requires reopening the original email link. No credentials are stored
in localStorage or sessionStorage. Public auth requests never trigger automatic
refresh. Protected requests retry once after single-flight refresh; Web Locks also
coordinate refresh and logout between tabs on supported secure contexts. The client
rechecks access before rotating, since another tab may already have refreshed it.
Network failures remain errors; only a confirmed 401 ends the local session.

The API enforces authorization independently. User listing is paginated through
`GET /auth/users?limit=20&offset=0`; password hashes and tokens are never returned.
`features/auth` handles sessions and account activation; `features/user-management`
handles administrator actions. `app/auth-runtime.ts` wires auth into the generic
HTTP client without introducing feature imports into shared code.

The root `.env` is shared with the backend. The admin build explicitly sets
NODE_ENV=production so the backend's local development setting cannot select the
React development runtime. Vite prebundles the CommonJS contracts workspace for dev.
See [Vite environment modes](https://vite.dev/guide/env-and-mode.html) and
[linked dependencies](https://vite.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies).

## Automated verification

From the repository root:

```sh
pnpm build
pnpm lint
pnpm --filter admin test
pnpm --filter admin exec playwright install chromium
pnpm --filter admin test:e2e
pnpm --filter api test:auth
```

Browser tests start Vite on port 4173 and mock the API; they do not send email or
modify accounts. API integration tests use an isolated local PostgreSQL schema.
Actual SMTP delivery and production cookie/CORS settings must be verified in the
deployment environment. Keep admin and API on the same site for SameSite=Strict.

## Catalog and access management

- `/subjects`: paginated subjects, draft creation, editing, publication and deletion.
- `/teachers`: teacher profiles, photo upload and independent subject assignments.
- `/media`: upload images/PDFs, retrieve a known file by ID, download and delete.
  The backend has no media-list endpoint. This page only lists files opened during
  its lifetime. Unattached uploads expire; PDFs have no permanent owner yet.
- `/users`: ADMIN can edit manager grants through the permissions panel.

Features own their API calls, schemas, forms and pages. Cross-feature imports use
public exports. HTTP paths stay in `shared/api/endpoints.ts`; transport contracts
come from `@project/contracts`. TanStack Form and Zod validate catalog forms.
TanStack Query manages server state and invalidation after writes.

Route entry, navigation and actions use effective permissions from `/auth/me`.
Server authorization remains authoritative, including for rights revoked while
an editor is open. Updating published content also requires its publish grant.
Subject assignment changes are saved separately from teacher details. Uploaded
photos are attached only after saving the teacher. Unused photos expire on the server.
Destructive actions require confirmation. Failed writes retain form input.

`pnpm --filter admin test:e2e` covers authentication, catalog lifecycle, teacher
photos and subjects, permissions, read-only access, upload failures and mobile
layout. These browser tests use mocked API responses; backend integration tests
cover actual authorization, database transactions and file validation separately.

Subjects contain only a name and display order in the editor. Publication is a
separate action. Subject descriptions are removed. The API generates stable slugs
for subjects and teachers; the admin never sends or edits slugs.

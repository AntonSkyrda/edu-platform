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

Catalog editors preserve drafts when the API returns `409 VERSION_CONFLICT`.
Use “Зіставити з актуальними даними” to load the current record. Independent field
changes are merged; conflicting fields require an explicit choice. Saving remains
manual and checks the newly reviewed version again. Assignment lists use the same
teacher version. Deleting a linked subject also advances that version, so an open
teacher form or assignment editor must review the cascade before saving again.
Assignment review refreshes the subject list without discarding the draft. Selected
subjects outside the current page stay visible; a confirmed deletion offers an
explicit removal action, while temporary lookup failures retain the selection.
Choosing the local assignment list keeps other edits, including their sort order.
Unsaved drafts remain in memory only while the editor is open.

Subject and teacher deletion sends the version shown in the list. On a conflict,
the admin cancels deletion and offers to open the latest record. A new attempt
requires another confirmation and version check; deletion is never retried
automatically.

Manager grants have their own version, including when all rights are revoked.
Conflicts preserve the selected checkboxes. Review compares the complete grant
set and requires an explicit choice when both administrators changed it; individual
privileges are never merged automatically. Saving stays manual, so a review cannot
silently restore rights another administrator revoked. A failed review preserves
the choices, and a further concurrent write triggers a new conflict.

## End-to-end tests with the real API

`pnpm test:e2e` from the repository root builds the API and shared packages,
starts the actual API entry point on `127.0.0.1:3101`, builds the admin for that
API, and serves the production SPA on `127.0.0.1:4174`. Both ports must be free.
Install Chromium first with `pnpm --filter admin exec playwright install chromium`.
The PostgreSQL and Redis services from `docker compose up -d` must be available;
the runner reads their `POSTGRES_*` and `REDIS_*` settings from the root `.env`
or environment. Only `localhost` and `127.0.0.1` are accepted for these services.

The suite in `e2e-real/` does not intercept requests or replace backend providers.
It covers login, HttpOnly cookies, refresh rotation, logout/revocation, manager
permissions in both UI and API, granting/revoking permissions for active sessions,
subject CRUD/publication, competing editors and
409 draft preservation/merge, stale subject/teacher deletions, competing permission
editors, image upload, teacher subject assignments and subject deletion conflicting
with open teacher drafts or a pending teacher deletion.
It uses real migrations in a fresh PostgreSQL schema, seeded test accounts,
a unique Redis namespace for rate limits and BullMQ queues, and temporary local
file storage. The runner removes only its own resources on normal shutdown,
test failure or SIGINT/SIGTERM. A forced kill of the runner may leave resources
whose names start with `admin_e2e_` or `edu-admin-e2e-`; inspect them before removal.
SMTP is redirected to a local rejecting server, so this suite sends no email.
The HTTP API runs in test mode; production TLS/Secure cookies and actual email
delivery still require deployment checks.

Each browser test gets a fresh context; catalog tests share an admin session
created through the real login API to stay within the actual login rate limit.
Each scenario sends a distinct test client IP; the API fixture trusts forwarding
headers only from loopback. Additional manager contexts use their own client IP.
This isolates scenarios without disabling guards, resetting counters or increasing
production limits. Global limits and proxy spoofing are checked by the API suites.
Tests run with one worker and no automatic retries. Existing `e2e/` mock-based
browser regressions remain available through `pnpm --filter admin test:e2e`.
Reports are in `apps/admin/playwright-report/{real,mocked}/`; failures retain
traces and screenshots in `apps/admin/test-results/`. Use `pnpm --filter admin
exec playwright show-report playwright-report/real` to view the real API report.

## Continuous integration

[GitHub Actions CI](../../.github/workflows/ci.yml) runs for pull requests,
pushes to `develop`/`main`, and manual dispatch. It installs the locked dependency
versions with Node 24 and pnpm 11.15.0, then checks:

- Repository hygiene and ESLint (`pnpm lint`).
- Types across all workspaces, API type tests and both browser suites (`pnpm typecheck`).
- Production builds (`pnpm build`).
- Every API integration suite against PostgreSQL 18 and Redis 8 (`pnpm --filter api test:integration`).
- Admin unit tests, existing browser regressions and real API end-to-end tests.

CI uses disposable service containers and test-only settings without repository
secrets. Browser reports and failure traces are uploaded for seven days. The
workflow provides the `Types, lint, build and tests` check; configure branch
protection in GitHub if this check should be required before merging.
For local API regression checks with the necessary builds, run `pnpm test:api`.


The Users screen shows the latest invitation delivery status and a mail health
summary, refreshed every 15 seconds. Pending requests recover automatically; an
administrator can resend a failed invitation with the existing action. A sent
status means acceptance by the SMTP server. The real-API browser suite covers
these states, safe user-list fields and resend while mail is unavailable.

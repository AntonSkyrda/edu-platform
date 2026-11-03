# Edu Platform API

NestJS backend for an invitation-only platform. PostgreSQL/Drizzle owns users,
invitations, password resets and sessions; BullMQ/Redis delivers auth emails.

## Local setup

Run from the repository root:

```sh
pnpm install
# Configure .env using .env.example before starting.
docker compose up -d postgres redis
pnpm build
pnpm db:migrate
pnpm dev:api
```

Set a random `ACCESS_JWT_SECRET` of at least 32 characters and `FRONTEND_ORIGIN`
(default local frontend: `http://localhost:3001`). Configure the existing SMTP
variables. Production requires HTTPS; auth cookies are Secure in production.
The frontend and API should be hosted on the same site for SameSite=Strict cookies.

There is no public registration or API for creating ADMIN accounts. Create the
initial administrator with `pnpm admin:create` as documented below. Assign manager
permissions through the ADMIN-only endpoints documented under Manager permissions.

## Authentication

| Method | Route                            | Access         | Body                             |
| ------ | -------------------------------- | -------------- | -------------------------------- |
| POST   | /auth/invitations                | Active ADMIN   | email, firstName, lastName, role |
| POST   | /auth/invitations/:userId/resend | Active ADMIN   | none                             |
| POST   | /auth/invitations/accept         | Public         | token, password                  |
| POST   | /auth/forgot-password            | Public         | email                            |
| POST   | /auth/reset-password             | Public         | token, password                  |
| POST   | /auth/login                      | Public         | email, password                  |
| POST   | /auth/refresh                    | Refresh cookie | none                             |
| POST   | /auth/logout                     | Refresh cookie | none                             |
| GET    | /auth/me                         | Access token   | none                             |
| POST   | /auth/users/:userId/block        | Active ADMIN   | none                             |
| POST   | /auth/users/:userId/unblock      | Active ADMIN   | none                             |
| GET    | /health/live                     | Public         | none                             |
| GET    | /health/ready                    | Public         | none                             |
| GET    | /health (readiness alias)        | Public         | none                             |

Responses use the existing `{ status_code, detail, result }` envelope. Access
JWTs last 15 minutes. Login and refresh return `{ expiresIn, user }` inside
`detail`; neither token is exposed in JSON. Both tokens use HttpOnly,
SameSite=Strict cookies, with Secure enabled in production. The access cookie
uses `/`, and the refresh cookie uses `/auth`. Logout clears both cookies.
The frontend must send requests with `credentials: 'include'` and does not need
to read or store tokens. The global CSRF guard rejects untrusted Origin headers
and cross-site unsafe requests, including public login and refresh endpoints.
Requests without browser origin metadata are allowed for CLI clients.
Refresh only once at a time: rotation
is single-use and concurrent refresh attempts return one success and one 401.
Sessions have a fixed 30-day expiry; rotation does not extend that deadline.

Invitations expire after 48 hours. The email link is
`FRONTEND_ORIGIN/accept-invitation#token=...`. The future frontend should read the
fragment, remove it from browser history, show a password form, and POST the token
and password to `/auth/invitations/accept`. Opening a link never activates a user.
Passwords are 8–64 characters and stored with Argon2id. Successful acceptance
sets ACTIVE and consumes the invitation atomically, then the user signs in.
Resending revokes previous invitations. Only MANAGER, TEACHER and STUDENT may be
invited through the API.

All routes are protected by default unless marked `@Public()`. Every protected
request checks the current database session and user status. Blocking revokes all
sessions, unused invitations and password reset links; unblocking never restores them. A previously
invited user returns to INVITED and needs a new invitation. Existing admins cannot
be blocked through these endpoints.

Email delivery is retried five times with exponential backoff. Stale, used,
expired or revoked invitations are skipped by the worker. If enqueueing fails,
the invitation remains pending in PostgreSQL and the dispatcher retries.
Completed/failed queue jobs are removed; delivery status and safe error codes
remain in PostgreSQL. Queue payloads contain only invitation IDs.

All API controller routes except health probes use shared Redis rate limits; see
the reverse proxy and rate limiting section below.
The admin frontend implements authentication, permission management and invitation delivery status.

## Verification

```sh
pnpm lint
pnpm test:auth
```

Auth integration tests use an isolated, randomly named schema in the local
PostgreSQL database, apply all migrations, and remove only that test schema on
completion. They intercept email delivery and do not send real emails. Tests cover
invitation reuse/expiry/resend, concurrent acceptance and refresh, login, blocking
races, logout, cookies, authorization, input validation and throttling. Recovery tests
cover eligibility, cooldown, token expiry/reuse, concurrent resets, transaction rollback,
session revocation, durable delivery, confirmation emails and public HTTP endpoints.

## Repository layer

`BaseRepository<TTable>` in `@project/database` provides `findById`, paginated
`findMany`, `create`, `update` and physical `delete`. It has no NestJS dependencies
or HTTP exceptions. Missing reads/updates return null; delete reports a boolean.
Updates exclude id and managed timestamps. Lists default to 50 records, with a
maximum of 100, ordered by creation time and id.

`UsersModule` exports only `UsersService`, which owns `UsersRepository`.
It exposes general `create`, `update`, `findByEmail` and `getByIdOrThrow` operations.
Authentication policies (invitation, activation, blocking) belong to AuthService.

`AuthModule` owns `services/`, `repositories/`, `processors/`, `dto/`,
`interfaces/` and `constants/`. InvitationsService, PasswordResetsService and SessionsService each use
only their own repository. The invitation processor calls InvitationsService;
EmailModule provides general email delivery. Infrastructure QueueModule owns
BullMQ configuration, queue registration and retry defaults, and exports a generic
QueueService. Auth delivery services submit jobs through QueueService. AuthEmailProcessor routes
the shared email queue to invitation and password recovery handlers in AuthModule. Infrastructure has no reverse dependency
on AuthModule.

`getByIdOrThrow(id)` reads without locking. To lock a row, use
`getByIdOrThrow(id, { transaction, lock: 'update' })`. The options type requires
an explicit transaction for locking. Pass that same transaction through service
methods to their repositories for atomic multi-table operations.

Never store the active
transaction on a singleton repository. Row-locking and token-consumption methods
require a transaction explicitly.

Run `pnpm --filter api test:types` after building packages to check the repository
type contract. `pnpm test:auth` also exercises inherited CRUD, pagination and
cross-repository rollback against PostgreSQL.

## Auth configuration

All auth settings are validated in the config module and accessed through
EnvironmentService. Defaults: ACCESS_TOKEN_TTL_SECONDS=900,
INVITATION_TTL_SECONDS=172800, SESSION_TTL_SECONDS=2592000,
JWT_ISSUER=edu-platform and JWT_AUDIENCE=edu-platform-api.
The auth cookie names are protocol constants in auth/constants.

### Create an administrator

From the repository root, run:

```sh
pnpm admin:create --email admin@example.com --first-name Anton --last-name Skyrda
```

The command builds the project and asks for a password twice with input hidden.
Passwords must contain 8–64 characters; do not pass them as command arguments.
It uses the database configured in the root `.env` and requires existing migrations.
It creates an ACTIVE ADMIN through UsersService with an Argon2id password hash.
Existing users are never promoted or overwritten; a duplicate email exits with an error.
No HTTP server, Redis workers or SMTP connection is started.

### API documentation

Swagger UI is available at `http://localhost:3000/docs` and OpenAPI JSON at
`http://localhost:3000/docs-json` when NODE_ENV is not production. Configuration
lives in `src/config/swagger.config.ts`. Use **Try it out** on `POST /auth/login` first. The browser stores both HttpOnly
cookies and sends them automatically; no manual Authorize token is needed.
In development only, the CSRF policy additionally allows `http://localhost:APP_PORT`
and `http://127.0.0.1:APP_PORT`. Production and test allow only FRONTEND_ORIGIN.
Swagger UI uses one browser session at a time; use the Postman collection for
scenarios that require separate admin and user sessions.
Cookie security schemes, request validation, response envelopes and error statuses
are included. Sign in through the login endpoint; no bearer token is needed.

### Delivery recovery and logout

New invitations store delivery state (`pending`, `sent`, `failed`, `skipped`) in
the same transaction as the invitation. A dispatcher recovers pending deliveries
at startup, after an invitation/resend commits, and every 30 seconds, in batches
of 100. HTTP does not await the dispatcher. Queue payloads contain the invitation
ID and a correlation ID. Tokens are derived using HMAC-SHA256 and a dedicated stable
`INVITATION_TOKEN_SECRET` (at least 32 characters); the database stores only their
hash. Keep this secret across restarts. Changing it requires resending pending
invitations. Existing invitations retain their original token validity; migration
marks their delivery as untracked/skipped to avoid sending them again.

SMTP success and final failures are recorded in the invitation, with attempt
counts and sanitized error codes. SMTP acceptance does not guarantee inbox delivery.
Delivery is at least once: a crash after SMTP acceptance but before recording it
can cause a duplicate email containing the same single-use link. A final failure
requires the administrator to resend; a Redis outage is recovered automatically.

Logout uses the refresh cookie, requires no valid access JWT, clears both cookies
and succeeds for missing or already revoked tokens. CSRF checks still apply.
Password limits are shared from contracts, and PasswordService owns Argon2 settings.

### Redis queue availability and timeouts

Invitation and resend responses acknowledge a committed PostgreSQL record with a
pending delivery. They do not wait for Redis or SMTP. A background dispatcher
submits stable job IDs to BullMQ; password reset links and password-change notices
use the same durable recovery pattern. Overlapping recovery scans share one run.
A failed enqueue ends the current batch, leaving rows pending for the next poll
(`INVITATION_DELIVERY_POLL_SECONDS` / `PASSWORD_RESET_DELIVERY_POLL_SECONDS`, both
30 seconds by default). A commit followed by process termination is recovered by
the next startup scan. No database migration is required.

`REDIS_QUEUE_TIMEOUT_MS` defaults to 1000 ms (integer range 100–5000). It bounds the
whole producer operation, including connection setup, BullMQ initialization and
adding a job or registering a scheduler. Producers have separate connections from
workers, with no offline command queue or automatic replay. A timeout/failure
closes the failed connection; the next attempt creates a fresh one. Pending work
stays in PostgreSQL rather than accumulating in application memory. Closing the
producer also cancels its in-flight network operations. Media cleanup registration
retries every five seconds after failure, so a queue outage at startup does not
permanently disable cleanup.

Workers keep their reconnecting/blocking connections and five SMTP delivery attempts
with exponential backoff. A lost Redis reply can mean a job was already added;
retrying its stable job ID deduplicates it while it exists, and delivered database
records are skipped by workers. This preserves the existing at-least-once email
semantics, not an exactly-once guarantee across SMTP and database failures.

The global rate limiter still deliberately returns 503 when its Redis connection
is unavailable. This change removes the extra queue wait after a request passes
that guard. Readiness continues to probe PostgreSQL and the limiter's Redis;
it does not promise queue-worker or SMTP progress.

Run `pnpm test:queue` with local PostgreSQL and Redis. Tests use isolated schemas,
queue prefixes, a loopback SMTP peer and a TCP relay affecting only queue connections.
They cover cold/established stalls, disconnects, lost acknowledgements, concurrent
operations, shutdown, backlog recovery, bounded invite/resend/reset HTTP responses,
real background delivery and media scheduler recovery. CI includes them in the
existing `test:integration` suite.

### SMTP availability and timeouts

API startup does not open or verify an SMTP connection. Delivery jobs connect
lazily when sending a message. A refused connection, failed authentication or a
silent SMTP server does not prevent HTTP startup, login, catalog requests or
liveness/readiness checks. Readiness still depends on PostgreSQL and Redis;
SMTP availability is deliberately not part of it.

Configure these values in milliseconds (each accepts integers from 100 to 60000):

| Variable                     | Default | Applies to                                                           |
| ---------------------------- | ------- | -------------------------------------------------------------------- |
| `SMTP_DNS_TIMEOUT_MS`        | 5000    | DNS resolver queries                                                 |
| `SMTP_CONNECTION_TIMEOUT_MS` | 5000    | Establishing the TCP/implicit TLS connection                         |
| `SMTP_GREETING_TIMEOUT_MS`   | 5000    | Waiting for the server's initial SMTP greeting                       |
| `SMTP_SOCKET_TIMEOUT_MS`     | 10000   | Inactivity during SMTP commands, authentication and message transfer |

These are Nodemailer's network timeouts, not a single deadline for the entire
message. DNS retries/fallbacks and multiple SMTP phases can take longer than one
configured timeout; socket activity resets the inactivity timer. A network timeout
closes the SMTP connection and propagates the failure to the existing delivery
worker. Each retry opens a fresh connection, so delivery resumes when the server
recovers without restarting the API.

BullMQ retains five attempts with exponential backoff (initial delay 1 second).
Pending invitations/password resets stay pending between attempts; successful
SMTP acceptance marks them sent. After the final failure they are marked failed
with a sanitized error code. Recovery after that requires an invitation resend
or a new eligible password-reset request. If the server accepts a message but its
acknowledgement is lost, retrying can deliver a duplicate; delivery remains at least
once.

`email.transport_unavailable` and `email.transport_ready` are emitted on state
changes observed during sends, rather than on startup. They contain no recipient,
message body, credentials or raw server response. Existing delivery events retain
the job correlation and safe error codes.

Run `pnpm test:email` with local PostgreSQL and Redis. Tests use an isolated local
SMTP peer and disposable database/queue resources. They cover refused connections,
a stalled TLS handshake, missing greetings, stalled commands/authentication/final
acknowledgements, socket cleanup, recovery on the same service, full API startup,
real queued invitation/password-reset retries, and all five failed attempts followed
by an explicit resend. No real email is sent. CI includes these tests through
`test:integration`.

### Structured logging

Pino is wired through `infrastructure/logger`; options live in `config/logger.config.ts`.
Set LOG_LEVEL (default info). Development uses pino-pretty; production/test write
JSON to stdout. No external logging service is required. Container/platform log
collectors can consume stdout later. Run on Node.js 22.12+ (nestjs-pino requirement).

Each HTTP request receives a server-generated X-Request-Id response header. Logs
include requestId, service, environment, method, path, response status and duration.
Queue jobs carry the originating requestId; recovered jobs get a new correlation ID.
Workers add jobId; delivery events include invitationId or resetId. Exceptions with status 500+ produce a diagnostic
event in addition to the HTTP completion log.

HTTP bodies, headers and query strings are omitted. Sensitive structured fields
are redacted. Error serialization retains only type, safe code and stack frames;
raw messages and causes are omitted because they can contain tokens or SQL values.
Do not interpolate secrets into log messages or custom event fields.

### Password recovery

`POST /auth/forgot-password` accepts `{ "email": "user@example.com" }` and returns
HTTP 200 with the same message for unknown, invited, blocked and active accounts.
Only ACTIVE users with a password receive a link, including administrators.
Each account has a 60-second cooldown. Both recovery endpoints allow 5 requests
per IP per minute. Requests use a minimum 200 ms response delay; this reduces
ordinary timing differences but does not guarantee constant timing under load.
No password or session changes happen when requesting a link.

The email contains `FRONTEND_ORIGIN/reset-password#token=...`. The token expires
after 30 minutes and is single-use. Requesting another link after the cooldown
revokes older unused links. A future frontend must read and remove the fragment
from history, collect an 8–64 character password and send `{ "token": "...",
"password": "..." }` to `POST /auth/reset-password`. Opening the email link alone
does not change the password. Until the frontend exists, copy the token from the
link into Swagger or Postman; the link's page itself is not implemented.

Resetting hashes the password with Argon2id, consumes the token and revokes all
sessions and other reset links in one transaction. Both HttpOnly cookies are
cleared; the user must log in again. A confirmation email is queued durably in
the same transaction and never contains the password. Blocking also revokes reset
links; unblocking does not restore them.

Set a dedicated random `PASSWORD_RESET_TOKEN_SECRET` of at least 32 characters.
Keep it stable across restarts. Only token hashes are stored in PostgreSQL;
queue jobs contain a reset ID and correlation ID. Pending email delivery resumes
at startup and every 30 seconds. Five SMTP attempts are allowed; failures store
safe diagnostic codes. After final failure, request a new link after the cooldown.
SMTP acceptance is not an inbox-delivery guarantee; a crash after acceptance can
cause duplicate email. Invalid or expired pending links are skipped.

Config defaults: `PASSWORD_RESET_TTL_SECONDS=1800`,
`PASSWORD_RESET_COOLDOWN_SECONDS=60`, `PASSWORD_RESET_DELIVERY_POLL_SECONDS=30`,
`PASSWORD_RESET_RESPONSE_MIN_MS=200`. Migration `0004_password_recovery` creates
only the password recovery table and its indexes.

Postman folder **04 — Password recovery** runs separately against an ACTIVE user.
Set `newPassword`, run the request for a link, pause for the email (allow 30 seconds
for dispatch), then paste its token into `resetToken`. The folder checks old sessions,
old passwords and token reuse. After completing it, update `userPassword` to the
new password before rerunning the original flow. On 429, wait 60 seconds.

## Subjects and teachers catalog

Catalog records are independent of user accounts. ADMIN has full access; MANAGER
requires the permission for each action. Public endpoints only expose PUBLISHED content.

| Method             | Path                               | Purpose                                                                    |
| ------------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| GET, POST          | `/admin/subjects`                  | Paginated list including drafts; create a draft                            |
| GET, PATCH, DELETE | `/admin/subjects/:id`              | Read, edit or permanently delete a subject                                 |
| PATCH              | `/admin/subjects/:id/status`       | Set DRAFT or PUBLISHED                                                     |
| GET, POST          | `/admin/teachers`                  | Paginated list including drafts; create a draft                            |
| GET, PATCH, DELETE | `/admin/teachers/:id`              | Read, edit or permanently delete a teacher                                 |
| PATCH              | `/admin/teachers/:id/status`       | Set DRAFT or PUBLISHED                                                     |
| GET, PUT           | `/admin/teachers/:id/subjects`     | Read or atomically replace all subject assignments                         |
| GET                | `/catalog/subjects`                | Published subjects ordered by sortOrder, then id                           |
| GET                | `/catalog/subjects/:slug`          | Published subject                                                          |
| GET                | `/catalog/subjects/:slug/teachers` | Published teachers in a published subject, ordered by assignment sortOrder |
| GET                | `/catalog/teachers`                | Published teachers ordered by lastName, then id                            |
| GET                | `/catalog/teachers/:slug`          | Published teacher                                                          |

Lists accept `limit` (1–50, default 20) and `offset` (0–1000000, default 0).
Responses use the existing envelope; list detail is `{items, hasMore}`.
Private endpoints require the existing HttpOnly access cookie and trusted origin
for mutations. Swagger includes request/response schemas for all endpoints.

A subject is a navigation category: name, display order and publication status.
It has no description and can be published immediately. Teachers require firstName
and lastName; publishing requires photoId, shortDescription and biography.
New records are always drafts. Teacher descriptions and biography are plain text.

Slugs are generated by the server from names, including Ukrainian transliteration.
A collision adds a UUID suffix, protected by database uniqueness constraints.
Slugs remain unchanged after renaming; existing URLs are preserved. Requests must
not supply slug or subject description. Migration 0008 removes the obsolete subject
description column without changing existing slugs.

`photoId` references an uploaded IMAGE managed by MediaService. Teacher cards remain
independent of user accounts. Files use private storage; published photos are served
through `/catalog/teachers/:slug/photo`, which checks publication on every request.

### Concurrent catalog edits

Subjects and teachers expose an integer `version`, starting at 1. Apply migration
0009 before deploying the updated API. Existing records receive version 1.

PATCH of a record or its publication status requires `expectedVersion` from the
snapshot the editor read. PUT of teacher subject assignments requires the same
field. DELETE of a subject or teacher also requires a JSON body with
`expectedVersion`. For example: `{"expectedVersion":3}` for deletion or
`{"name":"Updated name","expectedVersion":3}` for editing.
Missing or invalid versions return 400. A stale version returns 409 with envelope
`code: "VERSION_CONFLICT"`; no content, photo attachment or assignment changes are
committed. Deletion checks the version under the same row lock and transaction
as removal, before changing assignments or scheduling photo cleanup. An already
deleted record returns 404. Every successful edit advances the version, even if
values are unchanged.
Teacher content, publication and subject assignments share one version. Deleting a
subject increments the version of every teacher whose assignment is removed, in
the same transaction as the deletion. Unrelated teachers are unchanged. Stale
teacher edits, publication changes, assignment replacements and deletions therefore
return `409 VERSION_CONFLICT`, even if their old assignment list includes the deleted
subject. An unknown subject with a current teacher version still returns 404.
Assignment GET/PUT responses contain `{items, version}` from a consistent transaction.

Assignment writes lock referenced subjects with `FOR KEY SHARE` in ID order before
locking the teacher. Subject deletion locks its subject `FOR UPDATE`, then affected
teachers in ID order. This prevents new links from escaping a concurrent deletion
and avoids reversing the parent/teacher lock order. Links are checked again after
waiting for teacher locks, so a teacher that already removed the link is not
incremented a second time. Rollback restores the subject, links and versions together.

The admin retains the draft on conflict and never retries automatically. Reviewing
fetches the latest snapshot and merges changes to different fields. When both editors
changed the same field, the user explicitly chooses which value to retain and then
saves. A further concurrent edit produces another conflict. Assignment lists are
reconciled as a complete list, with an explicit choice if both editors changed it.
The assignment review refreshes available subjects while retaining the local draft.
Selected subjects outside the current page stay visible; a confirmed 404 identifies
a deleted subject, which the editor can explicitly remove while keeping other
changes. Lookup failures do not remove selections.
Drafts stay in memory while the editor is open; they are not persisted across reloads.
A deletion conflict cancels the attempt. The admin offers to open the latest
record; deleting it afterwards requires another explicit confirmation and checks
its version again. A failed review leaves the record untouched.
Older API clients must supply `expectedVersion` for edits and deletions. Create
request shapes are unchanged. Deploy the API and admin changes together.

Example assignment replacement:

```json
{
  "expectedVersion": 1,
  "subjects": [
    { "subjectId": "00000000-0000-4000-8000-000000000001", "sortOrder": 0 },
    { "subjectId": "00000000-0000-4000-8000-000000000002", "sortOrder": 2 }
  ]
}
```

An empty subjects array removes all assignments. Duplicate or nonexistent subjects
are rejected and the previous assignments remain intact. A published teacher can
exist without assignments, but appears on subject pages only after assignment.
Deleting a subject cascades its links, never its teachers. Deleting a teacher
cascades links and schedules the detached photo for orphan cleanup.

Schemas and inferred database models live in `@project/database`; transport types
and publication statuses live in `@project/contracts`. Services access their own
repositories. The join table uses a composite primary key rather than an artificial
id, so its repository exposes assignment operations instead of inheriting id-based
CRUD. Subject and teacher repositories inherit BaseRepository.

Run `pnpm test:catalog` from the repository root. It uses a temporary PostgreSQL
schema and removes it afterwards. HTTP tests exercise validation, authorization,
public visibility, pagination, atomic assignment changes, concurrent publication,
cascades and Swagger. Cascade concurrency tests coordinate real PostgreSQL row
locks to exercise both operation orders, including new links, removed links,
overlapping subject deletions, consistent reads and rollback. They inject an authentication adapter; the separate auth
integration suite verifies actual sessions and cookies.

## Private media uploads

| Method | Path                            | Purpose                                             |
| ------ | ------------------------------- | --------------------------------------------------- |
| POST   | `/admin/media/images`           | Upload multipart `file` (JPEG, PNG or WebP)         |
| POST   | `/admin/media/pdfs`             | Upload multipart `file` (PDF)                       |
| GET    | `/admin/media/:id`              | Editor-only metadata and relative preview URL       |
| GET    | `/admin/media/:id/content`      | Editor-only image preview or PDF download           |
| DELETE | `/admin/media/:id`              | Delete unused metadata and schedule object deletion |
| GET    | `/catalog/teachers/:slug/photo` | Public photo of a currently published teacher       |

All admin media routes require an ACTIVE ADMIN or a MANAGER with the matching
media permission and the existing HttpOnly cookie. Upload/delete also require a trusted origin. Upload endpoints are limited to
10 requests per minute per IP per endpoint. Each request accepts a single file and no
extra fields. Extension, client filename and claimed MIME type are not trusted.

Images default to 5 MiB and 20 million input pixels. Static JPEG, PNG and WebP are
fully decoded, auto-oriented, resized to fit 1600×1600 without enlargement, stripped
of EXIF metadata and encoded as WebP. Animated images, SVG and other formats are
rejected. PDFs default to 10 MiB and 500 pages, must parse successfully and must not
be encrypted. Parsing uses an isolated worker with a 5-second timeout and bounded JS
heap. PDFs are stored unchanged, returned as attachments with nosniff and sandbox
headers, and are not rendered inline. Structural validation is not a malware scan.

The upload response contains `id`, `kind`, `mimeType`, byte size, image dimensions or
PDF page count, and `/admin/media/:id/content` as `previewUrl`. Resolve relative URLs
against the API origin. No storage object keys or bucket URLs are exposed.

To set a teacher photo: upload an image, then PATCH `/admin/teachers/:id` with
`{"photoId":"<returned id>"}`. PDF IDs and unfinished uploads cannot be assigned as
photos. The same image may be shared. Preview requires editor authentication even
when the image is used publicly; the public teacher photo route separately checks
PUBLISHED status. Unpublishing, replacing the photo or deleting the teacher removes
access through that route on the next request. Responses are `private, no-store`;
bytes already downloaded cannot be revoked.

Storage is an infrastructure adapter, independent of media and catalog business
rules. `STORAGE_DRIVER=local` is the default: files live in the ignored repository
`.storage` directory, outside static hosting, with private filesystem permissions.
Set an absolute `STORAGE_LOCAL_ROOT` to use another directory. Local storage needs a
persistent volume and backups on deployment; it is not shared across API instances.

For S3-compatible storage, set `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, optional
`S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true` when required by the provider. Use both
`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, or leave both empty to use the SDK's
ambient credential chain. Provision a private bucket with public access disabled.
The app does not create buckets, change their policies or set public ACLs. Credentials
remain server-side. Driver choice is stored per media record; do not repoint existing
bucket/root configuration without migrating the objects. S3 version retention is a
bucket lifecycle concern.

Unattached uploads expire after 24 hours by default. Replacement/deletion of a teacher
starts that grace period for its old photo. Attached files are protected by a foreign
key and cannot be deleted; cleanup never removes a referenced object. A DB transaction
removes metadata and creates a durable deletion record before any storage deletion.
Object deletion is idempotent and failures are retried. Failed uploads remain tracked
as UPLOADING until cleanup. BullMQ schedules cleanup through infrastructure QueueService
(default hourly); Redis persistence and a running worker are required. File deletion
may therefore complete later than the DELETE response. Future PDF-owning modules must
add a restrictive media FK and manage attachment/release expiry; PDFs uploaded without
such a content reference currently expire like other abandoned uploads.

All limits are configured in the root `.env`; see `.env.example`. No frontend upload
UI is included. Migration 0006 replaces the unused photoKey column with photoId; it
aborts if existing photo keys are present, rather than silently discarding them.

Run `pnpm test:media` for processing, local filesystem, adapter, queue and catalog HTTP
checks. S3 SDK calls are mocked; validate your provider's bucket permissions and access
with its real credentials before deployment. `pnpm test:auth` verifies session and
cookie regressions. Tests use isolated PostgreSQL schemas and temporary files.

## Manager permissions

ADMIN has every permission without stored grants. MANAGER starts with none.
TEACHER and STUDENT cannot use catalog administration or private media endpoints.
Permissions are read from PostgreSQL for each protected request, not from JWTs.
Revocation takes effect on the next request; already running requests may finish.

Shared permission names and types live in `@project/contracts`:

- `subjects.read`, `subjects.create`, `subjects.update`, `subjects.publish`, `subjects.delete`
- `teachers.read`, `teachers.create`, `teachers.update`, `teachers.publish`, `teachers.delete`
- `media.read`, `media.upload`, `media.delete`

ADMIN-only endpoints:

- `GET /auth/users/:userId/permissions` returns `{permissions, version}` from one
  database snapshot. These are explicitly assigned grants, not effective permissions.
- `PUT /auth/users/:userId/permissions` atomically replaces all manager grants.
  Body: `{ "permissions": ["subjects.read", "teachers.read"], "expectedVersion": 1 }`.
  It returns `{permissions, version}` with the new version. An empty array revokes
  all grants. Unknown names and duplicates are rejected.

Apply migration 0010 before deploying this API. The grant version is stored on
the user, starts at 1 for existing accounts, and survives revocation of every grant.
Each successful replacement advances it, including a replacement with the same
values. Missing or invalid `expectedVersion` returns 400. Concurrent writes lock
the manager row; a stale version returns `409 VERSION_CONFLICT` without changing
either the grants or their version. A missing user returns 404.

On conflict, the admin preserves the selected checkboxes and blocks saving until
the current grants are reviewed. The complete grant set is compared as one field;
it never merges individual privileges automatically. If both administrators changed
the set, the user explicitly chooses the current or local set, then saves again.
Choosing the local set may restore privileges another administrator revoked.
A further concurrent change causes another conflict. Failed refreshes retain the
draft; it remains in memory only while the permissions editor is open.

`GET /auth/me` includes effective `permissions`. The admin client loads this
response after login. Invitations, blocking and permission management remain ADMIN-only.
Existing managers receive no permissions automatically after migration.

Read, create, update, publish and delete are independent actions. Publish covers
both publishing and returning to draft. Editing an already published subject or
teacher, including teacher subject assignments, also requires its publish grant;
this check runs inside the write transaction after locking the record. Delete
explicitly authorizes removal even when the record is published. Teacher subject
assignments require `teachers.update`; fetching the subject selection requires
`subjects.read`. Photo assignment requires knowing a valid ready image ID.

`media.read` grants access to the shared private media library, including draft
images and PDFs. Public teacher photos remain available only through the published
catalog route. Future course documents require additional course/object access
checks. Administrators manage manager grants through the admin users screen.

## Reverse proxy and shared rate limits

`TRUSTED_PROXIES` defaults to empty: the API uses the socket IP and ignores
forwarded addresses. Set a comma-separated list of **actual proxy IPs/CIDRs**.
For a proxy on the same host, for example:

```dotenv
TRUSTED_PROXIES=127.0.0.1/32,::1/128
REDIS_HOST=redis
REDIS_PORT=6379
RATE_LIMIT_REDIS_PREFIX=edu-platform:production:rate-limit
RATE_LIMIT_REDIS_TIMEOUT_MS=1000
```

Use your deployment's addresses instead of copying the example for a remote proxy.
Hostnames, boolean switches, hop counts, wildcard ranges (`/0`), malformed entries
and empty list items are rejected at startup. Trust every proxy hop that you operate;
Express walks `X-Forwarded-For` from right to left and stops at the first untrusted
address. Values further left cannot change the bucket. `X-Real-IP` and `Forwarded`
are not used. The edge proxy must overwrite client-supplied forwarding headers with
the observed client address; internal proxies append their observed peer. Restrict
network access to the API to the intended proxies. Do not trust a whole shared
container/client subnet when untrusted clients can connect from it. Trusting a proxy
also affects Express's forwarded host/protocol handling.

All replicas must use the same Redis server and `RATE_LIMIT_REDIS_PREFIX`; use a
different prefix for each application/environment. Keep existing `REDIS_HOST` and
`REDIS_PORT` aligned with the queue configuration. Counters have no process-local
fallback. Redis must be private and configured to avoid evicting live limit keys
(`noeviction`); use persistence if limits must survive Redis restarts. Restarting
only the API retains counters. Redis data loss resets them.

One global `ThrottlerGuard` covers all API controller routes, including public
catalog reads and administrative catalog writes. The default is 60 requests/minute
per client and route handler. Overrides remain: auth 20/minute, login/invitation
acceptance/password recovery/reset 5/minute, and media uploads 10/minute. Other
private media operations use the default 60/minute. Route parameters and query
strings cannot create new buckets. IPv4-mapped addresses share the IPv4 bucket;
IPv6 is grouped by /64, matching the throttler's default.

The global guards are registered together in `AuthModule`: rate limiting, then
CSRF, then authentication. Permission checks and validation follow. Requests
rejected with 400/401/403 still consume the route's budget; a blocked request
returns 429 before authentication or database permission queries. Controllers must
not add another `ThrottlerGuard`: use `@Throttle` only to override a limit, so each
request is counted once.

`GET /health/live`, `/health/ready`, and the legacy `/health` alias explicitly use
`@SkipThrottle()`. They consume no budget and have no rate-limit headers. Liveness
remains independent of Redis; readiness still probes PostgreSQL and Redis. CORS
preflight and non-controller endpoints such as development Swagger are handled by
middleware, outside the guard.

A Lua operation atomically prunes expired hits, checks the sliding window and records
the request using Redis time. At most the route's limit of timestamps is stored.
Exceeding the limit starts a block for the route's window (60 seconds); rejected
requests do not extend it. Keys expire automatically. Responses include
`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (seconds until
the oldest hit expires); 429 includes `Retry-After` in seconds. These headers are
exposed to the admin origin via CORS.

Redis connection/command failures return 503 on all limited routes, including the
public catalog, before authentication or the handler. Connection and command timeouts default to 1000 ms (configurable from
100 to 5000 ms). Requests are not queued while disconnected or automatically replayed;
a stalled connection is reset after a command timeout, and the Redis client
reconnects in the background. Queue producers use their own bounded connections;
workers retain independent reconnecting connections. Already forwarded commands may still count when a response times out.

Run `pnpm test:rate-limit` with local PostgreSQL and Redis running. The full-app
suite starts two complete `AppModule` instances with the same HTTP configuration
as `main.ts`, real sessions, image/PDF uploads, PostgreSQL and Redis. It exercises
all public/admin catalog routes, auth/media overrides, exact remaining budgets,
guard ordering, health exemptions, Redis outage and recovery. It overrides only
test configuration; production guards, services and storage remain active.

The focused Redis suite also covers proxy trust/spoofing, concurrent shared limits,
expiry, route/IP isolation, IPv6, disconnects and timeouts. Tests own a unique schema,
Redis prefixes and temporary media directories, which are removed after completion;
Redis is never flushed. All these tests also run through `test:integration` in CI.
The separate auth business suite uses an in-memory limiter; catalog business tests
load their feature module. Global HTTP policy is verified by the full-app suite.

## Liveness and readiness

- `GET /health/live` returns 200 while the HTTP process can respond. It does not
  query PostgreSQL or Redis and is suitable for a container liveness probe.
- `GET /health/ready` returns 200 only when a `SELECT 1` through the application's
  PostgreSQL pool and a `PING` through the rate limiter's Redis connection succeed.
  A failed/timed-out dependency returns 503. Use this path for load-balancer readiness.
- `GET /health` is retained as a readiness alias. It no longer always reports success;
  move any existing restart/liveness checks to `/health/live` before deployment.

All three routes are public, bypass rate limiting, and send `Cache-Control: no-store`.
The existing response envelope is preserved. Liveness detail is `{ "status": "ok" }`.
An unavailable Redis gives this readiness response (HTTP 503):

```json
{
  "status_code": 503,
  "detail": {
    "status": "not_ready",
    "checks": { "postgresql": "up", "redis": "down" }
  },
  "result": "error"
}
```

When both dependencies are up, status is `ready`, HTTP/status_code is 200 and result
is `success`. Responses expose only dependency status, never addresses, credentials,
SQL errors or stack traces. Readiness checks run concurrently and default to a
1000 ms deadline per dependency (`HEALTH_CHECK_TIMEOUT_MS`, range 100–5000 ms).
Set the load balancer's request timeout higher than this deadline. The Redis client's
own connection/command timeout can fail sooner (`RATE_LIMIT_REDIS_TIMEOUT_MS`).

Concurrent probes share work; completed results are not cached. A timed-out PostgreSQL
query destroys its checked-out connection. A late pool acquisition is released, and
further probes reuse its failure until it settles rather than queueing more acquisitions.
Redis probes likewise keep at most one pending PING and use the existing reconnecting
client. No probe writes application data or increments request-limit buckets.

PostgreSQL no longer gates HTTP startup with a one-off query. The API can expose
liveness while dependencies are down; readiness keeps it out of normal traffic until
connections recover. Validate this routing in your deployment: calling application
routes directly still bypasses the load balancer's readiness decision. Invalid environment values
still fail validation at startup. These probes check connectivity/query execution, not
migration state, worker progress, SMTP delivery or S3 availability.

Run `pnpm test:health` with local PostgreSQL and Redis running. Tests cover public
HTTP semantics, partial/total outages, timeout bounds, recovery, concurrent probes,
PostgreSQL pool cleanup and real dependency connections. Test outages use local TCP
relays; they do not stop shared services or modify database/Redis data.

### Queue isolation and browser integration tests

`REDIS_QUEUE_PREFIX` sets the BullMQ namespace (default `bull`, preserving existing
queues). Every API instance serving the same environment must use the same value;
different environments sharing Redis should use different prefixes. Changing this
value creates a separate set of queues and does not migrate pending jobs.

`pnpm test:api` builds dependencies and runs all `test/*.integration.cjs` suites
with local PostgreSQL and Redis. `pnpm typecheck` also runs the API's compile-time
repository contract tests. GitHub CI starts PostgreSQL 18 and Redis 8 service
containers and runs these checks alongside the build, lint and admin tests.

`pnpm test:e2e` drives the admin against the built API, including its real guards,
PostgreSQL, Redis and local media storage. See [admin testing](../admin/README.md#end-to-end-tests-with-the-real-api)
for isolation, ports, prerequisites and retained failure artifacts.


## Shutdown and bounded resource use

On SIGTERM/SIGINT the API enters a drain phase before closing PostgreSQL, queue
producers or the S3 client. New requests (including readiness) return 503 with
`SHUTTING_DOWN` and `Retry-After: 1`; `/health/live` stays available. Active HTTP
handlers, including disconnected callers with unfinished work, and active mail/
media jobs finish first. Dispatch timers stop accepting new work. The database
stays open until workers record their results.

`SHUTDOWN_TIMEOUT_MS` defaults to 30000 (1000–120000). If work cannot finish, the
signal handler exits with code 1 instead of waiting indefinitely or closing the
pool underneath it. PostgreSQL rolls back interrupted transactions; durable
pending mail and BullMQ stalled jobs recover on the next instance. Recovery of an
active BullMQ job may take its lock expiry plus the stalled-job scan interval.
Set the deployment's termination grace period above this deadline with room for
connection cleanup. Programmatic `app.close()` rejects on a drain timeout; callers
must terminate the process rather than continue serving from a partially stopped app.

PostgreSQL enforces these limits on every application-pool connection:

| Setting | Default | Allowed range (ms) |
| --- | ---: | ---: |
| `POSTGRES_STATEMENT_TIMEOUT_MS` | 5000 | 100–60000 |
| `POSTGRES_LOCK_TIMEOUT_MS` | 1000 | 100–30000 |
| `POSTGRES_IDLE_TRANSACTION_TIMEOUT_MS` | 10000 | 100–60000 |

These are server cancellations, not just HTTP response timers. Transactions roll
back on failure, releasing locks. The HTTP envelope returns 503 with
`DATABASE_TIMEOUT` and `Retry-After: 1`, without SQL/parameters. A timed-out write
should be retried only after checking the current record/version. Keep lock timeout
below statement timeout for a distinct lock deadline. Migration tooling uses its
own connections and is not subject to the application-pool limits.

Images and PDFs share one admission gate per API instance, before Multer reads the
file into memory. `MEDIA_MAX_CONCURRENT=2` (1–8) bounds active uploads/processing;
`MEDIA_MAX_WAITING=4` (0–32) bounds waiting requests and
`MEDIA_WAIT_TIMEOUT_MS=1000` (100–10000) limits their wait. Saturation returns 503
with `MEDIA_BUSY`. Disconnecting while queued releases the waiting slot; processing
and validation failures release active slots. These limits complement existing
file-size, image-pixel and PDF-worker timeouts. They do not impose a cluster-wide
quota: each instance owns its own memory/CPU capacity.

## Mail dispatch reservations and operations

Apply migrations with `pnpm db:migrate` before running the updated API. Migrations
0011/0012 add dispatch schedules/reservations and worker heartbeat records.
PostgreSQL remains the source of pending mail; HTTP writes do not wait for Redis.
Each dispatcher atomically reserves one eligible row with `FOR UPDATE SKIP LOCKED`.
Instances therefore share the backlog without all selecting the same first 100
rows. A pass processes up to 100 rows per delivery kind; future polls take the next
eligible rows, even when previous jobs are still waiting for SMTP.

`MAIL_DISPATCH_LEASE_MS=60000` (1000–600000) is the reservation/recheck interval.
Use a value longer than queue operation latency and SQL acknowledgement timeouts.
An enqueue failure schedules another attempt after the configured delivery poll
interval. A lost process/acknowledgement becomes eligible again after its lease
expires. Completion is fenced by a random lease ID, so an old dispatcher cannot
clear a newer reservation. Stable BullMQ job IDs prevent duplicate queued jobs;
SMTP remains at-least-once (a crash after SMTP accepts mail but before PostgreSQL
records success may send it again).

`GET /auth/users` adds the latest invitation's status, SMTP attempt count, dispatch
attempt count, enqueue/delivery timestamps and safe error code. Tokens, hashes and
lease IDs are excluded. The admin Users page displays waiting/sent/failed/skipped
states and refreshes every 15 seconds; resending uses the existing endpoint and
revokes the old invitation. “Sent” means SMTP accepted the message, not that the
recipient read it or that a mailbox accepted it.

`GET /admin/delivery` is ADMIN-only, rate limited and `no-store`. It provides
pending/failed counts and oldest pending age for invitations, password resets and
password-change notifications, plus worker process heartbeats, active jobs and last
completion/failure times. A heartbeat is process presence, not proof that SMTP or
Redis can deliver. Samples update every 15 seconds, expire from online counts after
60 seconds, and are removed after seven days. A graceful stop marks the worker
offline immediately after its final job. Failed invitation/reset links that are
revoked, used or expired no longer contribute to actionable failure counts.

An alert is raised when there is an actionable failure, pending work without a
recent heartbeat, or pending age exceeds `MAIL_BACKLOG_WARNING_SECONDS=300`
(10–86400). The admin page shows the warning. Structured logs emit
`mail.delivery_alert`, `mail.delivery_healthy` and `mail.monitor_unavailable` on state
transitions; connect these events to the deployment's existing log alerting system.
No external notification service is assumed. Check SMTP/Redis reachability, review
safe error codes and pending age, and resend failed invitations after recovery.
Health/readiness stays focused on serving HTTP; mail degradation does not remove
otherwise healthy instances from traffic.

`pnpm test:api` includes real SQL cancellation/rollback, bounded media admission,
250-record dispatch across two instances, expired/obsolete leases, access to delivery
metrics, and production signal shutdown with an active SMTP job and stalled Redis.
The signal test restarts the actual API entry point and verifies pending mail is
recovered. All use isolated local schemas, Redis prefixes and loopback mail peers.

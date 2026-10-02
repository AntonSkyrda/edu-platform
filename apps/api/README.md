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
initial administrator with `pnpm admin:create` as documented below. Granular
manager permissions are outside this implementation.

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
| GET    | /health                          | Public         | none                             |

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

The auth controller applies per-IP rate limits. The initial in-memory limiter is
for a single API instance; use shared throttling storage before scaling replicas.
Frontend screens and granular manager permissions are separate follow-up work.

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
at startup and every 30 seconds, in batches of 100. Queue payloads contain only
the invitation ID. Tokens are derived using HMAC-SHA256 and a dedicated stable
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

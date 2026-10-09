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

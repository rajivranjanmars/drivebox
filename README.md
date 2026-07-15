# DriveBox

DriveBox is a private file-storage application built with Next.js 16 and deployed to Cloudflare Workers through OpenNext. Better Auth stores users and sessions in D1, file metadata lives in D1 through Drizzle ORM, and file bodies are streamed to private R2 objects.

## Requirements

- Bun 1.3.11 (pinned in `package.json`)
- A Cloudflare account for staging or production resources

## Local setup

```bash
bun install --frozen-lockfile
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run dev
```

Replace `BETTER_AUTH_SECRET` in `.dev.vars` with at least 32 high-entropy characters before signing in. Local D1 and R2 data is stored under `.wrangler/` and is ignored by Git.

The application is available at [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start Next.js with local Cloudflare bindings |
| `bun run check` | Run TypeScript and ESLint |
| `bun run test` | Run Vitest inside the Workers runtime |
| `bun run build` | Create the Next.js production build |
| `bun run build:cloudflare` | Build and adapt the application for Workers |
| `bun run preview` | Build and preview in the Workers runtime |
| `bun run db:generate` | Generate D1 SQL migrations from the Drizzle schema |
| `bun run db:migrate:local` | Apply migrations to local D1 |
| `bun run cf:typegen` | Regenerate binding types from config and the committed variable-name template |
| `bun run deploy:dry-run` | Build and validate a Worker upload without deploying |
| `bun run deploy:staging` | Deploy the staging environment; requires explicit operator approval |
| `bun run deploy:production` | Deploy production; requires explicit operator approval |

Use `bun run test`, not bare `bun test`: the latter invokes Bun's built-in test runner instead of the configured Cloudflare Vitest environment.

## Cloudflare environments

`wrangler.jsonc` defines isolated local, staging, and production names. Before the first remote deployment:

1. Create the matching D1 database and R2 bucket with Wrangler invoked through Bun.
2. Add the returned D1 database ID to the appropriate environment in `wrangler.jsonc` if automatic provisioning is not used.
3. Set `BETTER_AUTH_SECRET` with `bunx wrangler secret put BETTER_AUTH_SECRET --env production` (and separately for staging).
4. Set `BETTER_AUTH_URL` to each environment's HTTPS origin with `bunx wrangler secret put BETTER_AUTH_URL --env production` (and separately for staging).
5. Apply D1 migrations remotely only after reviewing the SQL in `migrations/`.
6. Run `bun run deploy:dry-run` before any deployment.

Production data is intentionally not migrated from Firebase or Clerk. The first deployment starts with empty D1 and R2 resources.

## Security model

- Every file object uses `users/{userId}/files/{fileId}` and is accessed only through authenticated server routes.
- The browser never receives an R2 credential or public object URL.
- Uploads are streamed, limited to 20 MiB, and checked against the stored byte count.
- Download and delete operations require a D1 ownership match before touching R2.
- Authentication secrets belong in `.dev.vars` locally and Wrangler secrets remotely; they are never committed.
- Email/password authentication is rate-limited in D1.

## Architecture and migration notes

See [`docs/technology-audit.md`](docs/technology-audit.md) for the dependency inventory, migration decisions, and future replacement options.

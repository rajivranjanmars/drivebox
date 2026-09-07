# DriveBox

A private file workspace built with React and TanStack Start on Cloudflare Workers.
Better Auth and file metadata use D1; file bytes use S3-compatible object storage.

## Requirements

- Bun 1.3.11
- Node.js 22.12 or newer
- A Cloudflare account for deployment

## Local setup

```bash
bun install --frozen-lockfile
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run dev
```

Set a random `BETTER_AUTH_SECRET` of at least 32 characters and configure a
dedicated development bucket in `.dev.vars`. Local D1 data stays under
`.wrangler/`; object bytes go to the configured bucket. Open <http://localhost:3000>.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start TanStack Start in the local Workers runtime |
| `bun run check` | Run TypeScript and Biome |
| `bun run test` | Run the Worker integration tests |
| `bun run build` | Build the browser and Worker bundles with Vite |
| `bun run preview` | Preview the production Worker build locally |
| `bun run db:generate` | Generate D1 SQL migrations from the Drizzle schema |
| `bun run db:migrate:local` | Apply migrations to local D1 |
| `bun run db:migrate:remote` | Apply migrations to the production D1 database |
| `bun run cf:typegen` | Regenerate binding types from Wrangler configuration |
| `bun run deploy:dry-run` | Validate a production deployment |
| `bun run deploy` | Deploy to Cloudflare |

Use `bun run test`, not bare `bun test`, so Vitest uses the Workers runtime.

## Object storage

Configure any SigV4 S3-compatible service with:

| Setting | Meaning |
| --- | --- |
| `S3_ENDPOINT` | Provider endpoint origin |
| `S3_REGION` | Signing region |
| `S3_BUCKET` | Existing private bucket |
| `S3_ADDRESSING_STYLE` | `path` or `virtual` |
| `S3_ACCESS_KEY_ID` | Access key |
| `S3_SECRET_ACCESS_KEY` | Secret key |
| `S3_SESSION_TOKEN` | Optional session token |

Store credentials as Wrangler secrets, never in source control.

R2 uses the same adapter. Set `S3_ENDPOINT` to
`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, use region `auto` and path-style
addressing, then create an R2 API token for the access key and secret.

See [architecture and migrations](docs/architecture.md) for the request flow and an
explanation of why the SQL migration files must remain.

## Deploy

Set the production auth secret:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put S3_ACCESS_KEY_ID
bunx wrangler secret put S3_SECRET_ACCESS_KEY
bun run db:migrate:remote
bun run deploy:dry-run
bun run deploy
```

Replace the placeholder R2 account ID (or configure another provider) and review
`BETTER_AUTH_URL` in `wrangler.jsonc` before deploying.

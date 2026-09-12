# DriveBox

A private file workspace built with React and TanStack Start on Cloudflare Workers.
Better Auth, hierarchy, approvals, notifications, and file metadata use native D1;
file bytes use Cloudflare R2 exclusively through its S3-compatible API.

## Requirements

- Bun 1.3.14
- Node.js 22.12 or newer
- A Cloudflare account for deployment

## Local setup

```bash
bun install --frozen-lockfile
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run dev
```

Set random `BETTER_AUTH_SECRET` and `SUPERADMIN_BOOTSTRAP_TOKEN` values of at
least 32 characters and set `SUPERADMIN_BOOTSTRAP_EMAIL` to the verified operator.
Local D1 data stays under `.wrangler/`; object bytes go to the configured bucket.
Open <http://localhost:3000>. The
first matching account uses the bootstrap token; subsequent accounts require a
one-time code created through the approval workflow. When upgrading legacy data,
sign in as that operator and open `/claim-superadmin`. No existing user is
promoted automatically.

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

There is one object-storage path: Cloudflare R2 over signed S3-compatible HTTPS.
The application has no native R2 binding, alternate provider, or provider selector.
Configure that path with:

| Setting | Meaning |
| --- | --- |
| `S3_ENDPOINT` | Cloudflare account R2 endpoint |
| `S3_REGION` | `auto` for Cloudflare R2 |
| `S3_BUCKET` | Existing private bucket |
| `S3_ADDRESSING_STYLE` | `path` or `virtual` |
| `S3_ACCESS_KEY_ID` | Access key ID |
| `S3_SECRET_ACCESS_KEY` | Secret access key |
| `S3_SESSION_TOKEN` | Empty for R2 account API-token credentials |

The two Cloudflare accounts stay isolated:

- Development endpoint, bucket, and R2 keys belong in the ignored `.dev.vars`.
- Production endpoint and bucket belong in `wrangler.jsonc`; production R2 keys
  are stored as Wrangler secrets.

Use an Object Read & Write R2 token restricted to the relevant bucket in each
account. Both accounts use the bucket name `drivebox-files`; their account-scoped
namespaces keep the objects separate. Never reuse the development account's
endpoint or keys in production.

See [architecture and migrations](docs/architecture.md) for the request flow and an
explanation of why the SQL migration files must remain.

## Deploy

Set the production auth secret:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put SUPERADMIN_BOOTSTRAP_TOKEN
bunx wrangler secret put SUPERADMIN_BOOTSTRAP_EMAIL
bunx wrangler secret put S3_ACCESS_KEY_ID
bunx wrangler secret put S3_SECRET_ACCESS_KEY
bun run db:migrate:remote
bun run deploy:dry-run
bun run deploy
```

Review `BETTER_AUTH_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, and
`S3_ADDRESSING_STYLE` in `wrangler.jsonc` before deploying.

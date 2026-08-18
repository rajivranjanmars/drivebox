# DriveBox

DriveBox is a private file workspace built with TanStack Start, React 19, and Effect, running directly on Cloudflare Workers. Better Auth stores users and sessions in D1, while file bodies use a provider-neutral object-storage port that supports native Cloudflare R2 or any SigV4 S3-compatible service.

## Requirements

- Bun 1.3.11, pinned in `package.json`
- Node.js 22.12 or newer for TanStack Start's build-tool requirement
- A Cloudflare account for the production Worker, D1 database, and object bucket

## Local setup

```bash
bun install --frozen-lockfile
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run dev
```

Replace `BETTER_AUTH_SECRET` in `.dev.vars` with at least 32 high-entropy characters. The default `STORAGE_BACKEND=r2` keeps local D1 and R2 data under `.wrangler/`. The Cloudflare Vite plugin serves the app and bindings together at [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start TanStack Start in the local Workers runtime |
| `bun run check` | Run TypeScript and ESLint |
| `bun run test` | Run D1, R2, generic S3, Better Auth, multipart, and Effect tests in `workerd` |
| `bun run build` | Build the browser and Worker bundles with Vite |
| `bun run preview` | Preview the production Worker build locally |
| `bun run db:generate` | Generate D1 SQL migrations from the Drizzle schema |
| `bun run db:migrate:local` | Apply migrations to local D1 |
| `bun run db:migrate:remote` | Apply migrations to the production D1 database |
| `bun run cf:typegen` | Regenerate binding types from Wrangler configuration |
| `bun run deploy:dry-run` | Build and validate a Worker upload without deploying |
| `bun run deploy` | Build and deploy the single production Worker |

Use `bun run test`, not bare `bun test`; the script selects Vitest's Cloudflare Workers pool.

## Cloudflare stack

`wrangler.jsonc` intentionally defines one remote application stack:

- Worker: `drivebox`
- D1 database: `drivebox`
- R2 bucket: `drivebox-files`

Before the first deployment, set `BETTER_AUTH_SECRET` with `bunx wrangler secret put BETTER_AUTH_SECRET`, verify the public `BETTER_AUTH_URL` in `wrangler.jsonc`, review and apply `migrations/`, then run `bun run deploy:dry-run`. Local development still uses isolated emulated bindings under `.wrangler/`; it does not write to production.

## Object storage

R2 is the default because its Worker binding needs no object-store credentials or network hop. The application code depends only on `ObjectStorage`, so the provider can be changed without touching routes, Effect workflows, D1 metadata, or the browser.

Every object key mirrors the user's selected file tree under a stable Better Auth user ID:

```text
<user-id>/
├── avatar.png
└── Documents/
    └── Reports/
        └── report.pdf
```

Names and folders are normalized server-side; absolute paths and `..` traversal are rejected. Uploading the same relative path replaces that file, matching normal drive behavior. Human names and email addresses are not used as bucket prefixes because they can collide, change, or expose personal information.

To use another S3-compatible provider, set `STORAGE_BACKEND=s3` and provide:

| Setting | Meaning |
| --- | --- |
| `S3_ENDPOINT` | Provider endpoint origin, such as `https://s3.us-east-1.amazonaws.com` or an R2 S3 endpoint |
| `S3_REGION` | Signing region; use `auto` for R2's S3 API |
| `S3_BUCKET` | Existing private bucket |
| `S3_ADDRESSING_STYLE` | `path` for MinIO/R2/most compatible providers, or `virtual` when the bucket belongs in the hostname |
| `S3_ACCESS_KEY_ID` | Access key, stored as a secret outside version control |
| `S3_SECRET_ACCESS_KEY` | Secret key, stored as a secret outside version control |
| `S3_SESSION_TOKEN` | Optional temporary-credential token |

Put non-secret endpoint, region, bucket, and addressing settings in Wrangler `vars`. Store each credential with `bunx wrangler secret put <NAME>`. The adapter uses standard SigV4 create/upload-part/complete/abort/get/delete operations and does not use a provider-specific SDK.

## Architecture

- TanStack Start owns full-document SSR, typed routing, protected loaders, and server routes.
- The Cloudflare Vite plugin runs the same Worker bindings in development and production.
- Better Auth owns email/password authentication and D1-backed sessions. Its TanStack cookie plugin is installed last as required by the integration.
- Effect models session and file workflows with typed errors and request-local database/object-storage layers.
- D1 stores auth, file metadata, resumable upload sessions, and uploaded-part ETags. R2 or another private S3-compatible bucket stores file bodies.
- The browser splits files into replayable 8 MiB parts, retries transient failures with backoff, and resumes recorded chunks when the same file is selected again. Files up to 50 GiB remain below S3's 10,000-part ceiling.
- Folder selection preserves relative paths. Object keys use `<user-id>/<relative-path>`, producing one isolated mirror per user at the bucket root.
- Downloads and deletes require a D1 ownership match before object access. No storage credential or public object URL reaches the browser.
- Incomplete sessions older than six days are restarted safely; providers should also enable an incomplete-multipart lifecycle policy.

See [`docs/technology-audit.md`](docs/technology-audit.md) for every runtime dependency and realistic replacement options.

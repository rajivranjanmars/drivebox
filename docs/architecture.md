# Architecture

DriveBox is a private file workspace deployed as one Cloudflare Worker.

## Request flow

1. TanStack Start renders the React application and handles API routes.
2. Better Auth resolves the user session from D1.
3. The browser splits uploads into 8 MiB parts and retries failed parts.
4. D1 records file metadata and resumable-upload progress.
5. A configured S3-compatible service stores the file bytes.
6. Downloads and deletes require a metadata record owned by the current user.

## Storage

Objects use the key `<user-id>/<relative-path>`. This keeps accounts isolated and
preserves uploaded folder paths. Selecting the same path again replaces the file.

The `ObjectStorage` interface keeps file workflows independent from the provider.
The runtime uses one SigV4 adapter for AWS S3, R2, and other compatible services;
credentials remain on the Worker.

## Why migrations are required

D1 starts as an empty SQLite database. The files under `migrations/` create and
upgrade the tables used by Better Auth, file metadata, rate limiting, and resumable
uploads.

Migrations are versioned so the same schema changes are applied once, in order, to
local, test, and production databases. Do not delete or combine migrations after
they have been deployed: Cloudflare records which files have run, and changing that
history can leave existing databases on the wrong schema.

When `src/db/schema.ts` changes:

```bash
bun run db:generate
bun run db:migrate:local
# Review the generated SQL before production:
bun run db:migrate:remote
```

## Boundaries

- Maximum file size: 50 GiB.
- Multipart state becomes stale after six days and is restarted safely.
- D1 and object storage cannot share a transaction; completion verifies the stored
  object size when a provider response is lost.
- Files are private and are streamed through authenticated routes.

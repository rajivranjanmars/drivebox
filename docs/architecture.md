# Architecture

DriveBox is a private file workspace deployed as one Cloudflare Worker.

## Request flow

1. TanStack Start renders the React application and handles API routes.
2. Better Auth resolves the user session from D1; the governance module resolves role, hierarchy, and requested drive owner.
3. The browser splits uploads into 8 MiB parts and retries failed parts.
4. D1 records file metadata and resumable-upload progress.
5. Cloudflare R2 stores file bytes through the sole SigV4 S3-compatible HTTPS adapter.
6. Mutations require ownership. A direct parent admin may list and download a child's files read-only; all other cross-user access is hidden.

## Storage

Objects use the key `<user-id>/<relative-path>`. This keeps accounts isolated and
preserves uploaded folder paths. Selecting the same path again replaces the file.

The `ObjectStorage` interface keeps file workflows testable through an in-memory
adapter while deployed and local runtimes use the SigV4 adapter against Cloudflare
R2. Native R2 bindings and alternate object-storage providers are intentionally not
configured. Development and production use separate Cloudflare accounts, endpoints,
buckets, and credentials. Existing object keys remain unchanged within each bucket.

## Governance

`src/server/governance.ts` is the policy seam for account requests, immediate-parent approvals, invitation activation, persistent notifications, and drive access. The browser never chooses requester, parent, approver, or tenant-root identifiers.

Existing users are never promoted by migration order. For an upgraded public-signup
database, the authenticated user matching `SUPERADMIN_BOOTSTRAP_EMAIL` explicitly
claims the empty hierarchy through `/api/bootstrap` with the bootstrap token. Fresh
installations admit only that configured email with `SUPERADMIN_BOOTSTRAP_TOKEN`.
D1 batches atomically commit each governance transition with its notification and
audit record. See `docs/product-model.md` for the authorization matrix and lifecycle.

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

# DriveBox repository guide

## Stack

- React 19 with TanStack Start/Router, built by Vite.
- One Cloudflare Worker serves the application and route handlers.
- Better Auth and Drizzle use Cloudflare D1.
- File bytes use the `ObjectStorage` interface; production targets the configured SigV4 S3-compatible endpoint.
- Styling uses Tailwind CSS 4 and shadcn-style primitives under `src/components/ui`.

## Commands

```bash
bun install --frozen-lockfile
bun run dev
bun run check
bun run test
bun run build
bun run deploy:dry-run
```

Use `bun run test`, not bare `bun test`, so Vitest runs in the Workers runtime. After changing `src/db/schema.ts`, run `bun run db:generate`, inspect the generated SQL, and apply it locally with `bun run db:migrate:local`. Regenerate Cloudflare binding types with `bun run cf:typegen` after changing `wrangler.jsonc`.

## Conventions and invariants

- Keep request-scoped bindings and identity data out of module-level mutable state.
- Every custom mutation route validates the authenticated actor and same-origin request.
- Treat `src/server/governance.ts` as the policy seam for hierarchy, approval, and drive visibility. UI checks never replace server authorization.
- Pending account requests are not Better Auth users. An approved, single-use invitation is required before account creation.
- File mutations operate only on the signed-in owner's drive. Authorized ancestors may receive explicit read-only access to a direct child's drive.
- Keep object keys rooted at the stable owner ID so existing objects remain compatible.
- Return not-found responses for resources outside the actor's visibility to reduce identifier disclosure.
- Never commit secrets or plaintext invitation tokens. Local secrets belong in `.dev.vars`; deployed secrets use Wrangler.
- Preserve migration history after deployment. Migrations are additive unless a separately reviewed data migration proves otherwise.

## Architecture and durable decisions

Read `docs/architecture.md` and `docs/product-model.md` before substantial auth, storage, hierarchy, or dashboard work. Update them only with verified, durable behavior.

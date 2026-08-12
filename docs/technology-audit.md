# DriveBox technology audit

Audit date: 2026-08-10

## Outcome

DriveBox now runs as a direct Cloudflare application: TanStack Start and the Cloudflare Vite plugin produce the Worker and browser bundles, Effect owns server workflows, Better Auth owns application authentication, D1 stores structured data and resumable upload state, and a provider-neutral port stores file bodies in native R2 or any SigV4 S3-compatible service. Bun remains the only package manager and script runner.

The repository has no direct Next.js, OpenNext, Clerk, Firebase, npm, pnpm, or Yarn dependency, configuration, runtime import, or lockfile.

## Current stack and replacement paths

| Area | Current technology | Why it is used | Sensible replacement if priorities change |
| --- | --- | --- | --- |
| Full-stack framework | TanStack Start 1.168.42 | SSR, streaming, typed file routing, loaders, and Worker-native server routes without an adapter layer | React Router framework mode for a broader ecosystem; Hono plus Vite for a thinner API/SPA architecture |
| Routing | TanStack Router 1.170.25 | End-to-end route, search, loader, and navigation types | Bundled with the framework decision; do not replace independently |
| UI runtime | React 19.2.8 | Current component runtime supported by TanStack Start | SolidStart only if accepting a full UI rewrite |
| Application effects | Effect 3.22.1 | Typed failures, dependency layers, composable database/object workflows, and testable services | Plain async functions plus discriminated error unions if the server domain remains small |
| Worker integration | Cloudflare Vite plugin 1.51.1 | Direct Workers development/build integration and binding access | Wrangler-only custom Worker entrypoint for a non-framework application |
| Cloudflare CLI | Wrangler 4.120.0 | Type generation, local bindings, D1 migrations, dry-runs, and deployment | Keep; it is the platform control plane even if the UI framework changes |
| Authentication | Better Auth 1.6.26 + D1 adapter | Application-owned users, sessions, rate limits, and email/password auth | Cloudflare Access for an internal workforce app; Auth.js or a hosted identity vendor if ownership/operations priorities reverse |
| Structured data | Cloudflare D1 + Drizzle ORM 0.45.2 | Relational auth/file metadata and repeatable SQL migrations | Direct prepared D1 statements for a very small schema; Hyperdrive plus PostgreSQL for heavier relational workloads |
| File storage | `ObjectStorage` port with native R2 and generic S3 adapters | Keeps routes and workflows provider-neutral while retaining a zero-credential, low-hop Cloudflare default | Amazon S3, MinIO, Backblaze B2, R2's S3 API, or another correctly implemented SigV4 S3-compatible service |
| S3 signing | aws4fetch 1.0.20 | Small Worker-native SigV4 client with bounded retries; avoids the much larger AWS SDK for seven object operations | AWS SDK v3 if advanced provider features eventually outweigh bundle size |
| Build tool | Vite 8.2.1 | TanStack and Cloudflare build pipeline with fast local feedback | Rsbuild only if its ecosystem or performance materially wins for this app |
| Language tooling | TypeScript 6.0.3 + ESLint 10.8.1 | Strict types and current lint rules across routes, Effects, and Worker adapters | TypeScript 7 is blocked until `typescript-eslint` adds its explicitly pending TS 7 API support |
| Package tooling | Bun 1.3.11 | Installer, lockfile, scripts, and `bunx` CLI execution | Keep unless an unsupported tool requires another package manager |
| Styling | Tailwind CSS 4.3.3 + its Vite plugin | CSS-first, PostCSS-free responsive design system with a small production bundle | CSS Modules are the package-light alternative if utility styling stops paying for itself |
| Accessible primitives | Radix dropdown and slot | Keyboard/focus behavior plus polymorphic buttons | Native elements, Base UI, or Ariakit if consolidating the component layer |
| Upload interaction | `react-dropzone` 20.1.0 | Accessible drag/drop and file rejection handling | Native file input and drag events to remove a dependency |
| Presentation utilities | Lucide, `pretty-bytes`, CVA, `clsx`, `tailwind-merge` | Icons, readable sizes, and predictable variant/class composition | Local SVGs, an `Intl.NumberFormat` formatter, and small local class helpers |
| Authentication theme state | Local React context | Framework-neutral light/dark/system behavior with no Next-specific package | CSS-only system theme if manual selection is not required |
| Testing | Vitest 4.1.10 + Workers pool 0.20.3 | D1/R2/Better Auth/Effect integration plus signed generic-S3 contract tests in `workerd` | Keep; Node mocks would provide weaker platform evidence |

## Request flow

1. Better Auth receives `/api/auth/*`, writes users, credentials, sessions, and rate limits to D1, and uses TanStack's cookie integration.
2. The protected dashboard loader resolves the request session, then executes the Effect file-list program with request-local D1 and object-storage adapters.
3. The browser preserves folder-relative paths, creates or resumes a D1 upload session, and sends fixed 8 MiB parts with bounded exponential retries.
4. The Worker validates every expected part, persists provider ETags, completes the multipart upload, and upserts the D1 file record at `<user-id>/<relative-path>`.
5. Download and delete programs query D1 by both `fileId` and `userId`; only a match permits private object access, which streams directly to the response.

## Operational boundaries

- D1 and object storage cannot share an atomic transaction. Completion recovery checks for an exact-size committed object after a lost provider response; a scheduled orphan reconciler is still sensible at high scale.
- Multipart files are capped at 50 GiB with 8 MiB parts, comfortably below the S3 maximum of 10,000 parts. The legacy single-request endpoint remains capped at 20 MiB.
- R2 automatically expires incomplete multipart uploads after seven days. Other providers need an equivalent bucket lifecycle rule; DriveBox restarts D1 sessions after six inactive days.
- Generic S3 mode proxies bounded parts through the authenticated Worker, avoiding browser CORS and credential exposure. Native R2 remains more efficient on Cloudflare because bindings avoid an external SigV4 request.
- D1 remains the Cloudflare-specific structured-data layer for Better Auth and searchable metadata. Only file/object storage is provider-agnostic in this change.
- Email verification, password reset delivery, social login, sharing, quotas, and malware scanning remain product additions, not migration gaps.
- The Worker compatibility date is 2026-08-08, the newest date supported by the current Cloudflare Vite plugin and Workers test pool. Advance it after their embedded `workerd` runtime catches up.
- `bun audit --production` currently reports four advisories (two high, two moderate) in nested Vite/Vitest/TanStack build tooling. All direct dependencies and compatible transitive updates are current; these packages are not part of the Worker request path, and forcing incompatible global binary/parser overrides was rejected.
- Staging/production resource IDs, origins, secrets, and remote migrations must be supplied before deployment.

## Verification baseline

```bash
bun install --frozen-lockfile
bun run cf:typegen
bun run check
bun run test
bun run build
bun run deploy:dry-run
```

Passing local gates proves the repository and Worker bundle; it does not prove a remote deployment or production account configuration.

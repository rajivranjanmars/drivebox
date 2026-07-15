# DriveBox technology audit

Audit date: 2026-07-15

## Outcome

The original application used Next.js 14.0.4, React 18, npm, Clerk, Firebase Firestore, and Firebase Storage. It had no automated tests, database migrations, deployment adapter, or CI configuration. No legacy users, files, or metadata were retained by decision.

The application now uses the latest stable Next.js 16.2.10 and React 19.2.7 releases, Bun for all package and script operations, Better Auth for email/password authentication, Cloudflare D1 for relational data, and private Cloudflare R2 objects for file bodies. OpenNext adapts the standard Next.js Node runtime build for Cloudflare Workers.

## Current stack

| Area | Technology | Decision | Reason / replacement path |
| --- | --- | --- | --- |
| Web framework | Next.js 16.2.10 App Router | Keep | Current stable framework; routes and server components fit the application. If reducing adapter/runtime weight becomes more important, evaluate React Router on Workers or Vinext as a separate rewrite. |
| UI runtime | React 19.2.7 | Keep | Required and supported by current Next.js. |
| Package manager/runtime tooling | Bun 1.3.11 | Keep | Sole installer, lockfile owner, and script runner. Platform CLIs are invoked through Bun scripts or `bunx`. |
| Worker adapter | `@opennextjs/cloudflare` 1.20.1 | Keep while using Next.js | Officially documented Cloudflare path for full-stack Next.js on Workers. It can be removed only by leaving Next.js or moving hosting. |
| Deployment CLI | Wrangler 4.111.0 | Keep | Manages bindings, local emulation, migrations, type generation, dry-runs, and deployment. |
| Authentication | Better Auth 1.6.23 | Keep | Replaces Clerk with application-owned D1 users and sessions. Cloudflare Access is an alternative only for workforce/internal access, not general customer accounts. |
| Structured data | Cloudflare D1 + Drizzle ORM 0.45.2 | Keep | Replaces Firestore with relational SQLite semantics and repeatable SQL migrations. Drizzle can be removed in favor of direct prepared D1 statements if the schema remains very small. |
| File bodies | Cloudflare R2 binding | Keep | Replaces Firebase Storage; direct bindings avoid API tokens and network hops inside Workers. |
| Styling | Tailwind CSS 3.4 + shadcn-style components | Keep for now | Existing design system works. Tailwind 4 is a separate styling migration and was intentionally excluded from the framework/storage upgrade. |
| Component primitives | Radix UI | Keep | Accessible dropdown/slot primitives already used by local UI components. Replace only if consolidating the component system. |
| Data table | TanStack Table | Review later | Capable and type-safe, but heavier than necessary for the current small table. A native table is a viable simplification if filtering/pagination are not planned. |
| Icons | Lucide React + React File Icon | Keep | Presentation-only. React File Icon can be removed in favor of a smaller local extension-to-icon map. |
| Theme | `next-themes` | Keep | Provides system/light/dark behavior with little application code. |
| Upload UI | `react-dropzone` | Keep | Handles drag/drop rejection and accessibility. Native file input plus drag events is a package-free alternative. |
| Formatting utilities | `pretty-bytes`, `clsx`, `tailwind-merge`, CVA | Keep | Small focused utilities used by the table/component layer. Consolidate only during a UI-system rewrite. |
| Testing | Vitest 4 + Cloudflare Workers pool | Keep | Runs D1 and R2 integration tests in `workerd`, closer to production than Node-only mocks. |

## Removed systems

- Firebase SDK, Firestore reads/writes, Firebase Storage uploads/downloads, and every `NEXT_PUBLIC_FIREBASE_*` variable.
- `react-firebase-hooks` and realtime Firestore subscriptions.
- Clerk provider, middleware, client hooks, hosted modal, and Clerk environment variables.
- npm lockfile and multi-package-manager README instructions.
- Next.js 14's removed `next lint` command.

Repository searches and the dependency manifest must remain free of executable Firebase and Clerk imports.

## Data and request flow

1. Better Auth receives `/api/auth/*` requests and stores users, credentials, rate limits, and sessions in D1.
2. The dashboard resolves the session server-side and queries only that user's D1 file records.
3. Upload requests stream the file body into a private R2 binding, verify the stored byte count, then insert metadata into D1. A failed metadata insert deletes the new R2 object.
4. Download and delete routes first query D1 with both `fileId` and `userId`; only an ownership match permits R2 access.
5. R2 content is streamed to the caller and never converted into a public URL.

## Operational limitations and follow-ups

- No prior Firebase or Clerk data is migrated; this is intentional.
- Email verification, password-reset email delivery, social login, quotas, sharing, and malware scanning are not part of the original feature set and remain out of scope.
- R2 and D1 cannot participate in one atomic transaction. Upload compensation handles the common metadata-failure path; periodic orphan reconciliation would be appropriate at larger scale.
- The 20 MiB request limit is an application policy. For substantially larger uploads, add R2 multipart uploads and resumability rather than raising this endpoint's limit.
- There is no deployment workflow yet. Add CI only after deciding the repository's GitHub/Cloudflare account policy and secret ownership.
- Staging and production resource identifiers and HTTPS origins must be supplied before remote deployment.
- `bun audit` reports no critical advisories, but currently reports high-severity advisories in nested, build-only dependencies pulled by the latest OpenNext, Tailwind, ESLint, and test tooling. Compatible updates are exhausted. These packages are not bundled into the application request path; forcing global cross-major overrides was rejected because Bun does not support nested overrides and a global override could break unrelated tools. Recheck after upstream releases.

## Verification baseline

- `bun install --frozen-lockfile`
- `bun run check`
- `bun run test`
- `bun run build`
- `bun run build:cloudflare`
- `bun run deploy:dry-run`

No remote command should be run as part of local verification.

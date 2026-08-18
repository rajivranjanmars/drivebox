import { Data, Effect } from "effect";
import { getAuth } from "@/lib/auth";

export type CurrentSession = Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>;

export class SessionLookupError extends Data.TaggedError("SessionLookupError")<{
  readonly cause: unknown;
}> {}

/** Resolves the Better Auth session in Effect's typed error channel. */
export function resolveSession(headers: Headers): Effect.Effect<CurrentSession, SessionLookupError> {
  return Effect.tryPromise({
    try: () => getAuth().api.getSession({ headers }),
    catch: (cause) => new SessionLookupError({ cause }),
  });
}

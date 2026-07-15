import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export type CurrentSession = Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>;

/** Resolves the authenticated user and session for the active request. */
export async function getCurrentSession(): Promise<CurrentSession> {
  return getAuth().api.getSession({ headers: await headers() });
}

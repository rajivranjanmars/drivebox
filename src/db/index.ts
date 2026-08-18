import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { env } from "cloudflare:workers";
import { schema } from "@/db/schema";

export type Database = DrizzleD1Database<typeof schema>;

/** Creates a request-scoped Drizzle client for the provided D1 binding. */
export function createDatabase(binding: D1Database): Database {
  return drizzle(binding, { schema });
}

/** Returns a fresh D1 client bound to the active Cloudflare request. */
export function getDatabase(): Database {
  return createDatabase(env.DB);
}

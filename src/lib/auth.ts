import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { env } from "cloudflare:workers";
import type { Database } from "@/db";
import { getDatabase } from "@/db";
import { schema } from "@/db/schema";

export interface AuthRuntimeOptions {
  database: Database;
  secret: string;
  baseURL: string;
}

/** Creates a Better Auth instance scoped to one request and one D1 client. */
export function createAuth(options: AuthRuntimeOptions): Auth {
  const authOptions: BetterAuthOptions = {
    appName: "DriveBox",
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(options.database, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      database: {
        generateId: "uuid",
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    plugins: [tanstackStartCookies()],
  };

  return betterAuth(authOptions);
}

/** Builds the request-scoped auth service from Cloudflare bindings and secrets. */
export function getAuth(): Auth {
  const secret = env.BETTER_AUTH_SECRET;
  const baseURL = env.BETTER_AUTH_URL;

  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  if (!baseURL) {
    throw new Error("BETTER_AUTH_URL must be configured");
  }

  const parsedBaseURL = new URL(baseURL);
  if (env.APP_ENV !== "development" && parsedBaseURL.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use HTTPS in production");
  }

  return createAuth({
    database: getDatabase(),
    secret,
    baseURL: parsedBaseURL.origin,
  });
}

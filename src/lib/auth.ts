import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { getDatabase } from "@/db";
import { schema, user } from "@/db/schema";
import { activateEnrollment, validateEnrollment } from "@/server/governance";

export interface AuthRuntimeOptions {
  database: Database;
  secret: string;
  baseURL: string;
  bootstrapSecret?: string;
  bootstrapEmail?: string;
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
    databaseHooks: {
      user: {
        create: {
          before: async (candidate, context) => {
            const token = context?.headers?.get("x-drivebox-enrollment")
              ?? context?.request?.headers.get("x-drivebox-enrollment")
              ?? "";
            try {
              const enrollment = await validateEnrollment(options.database, candidate.email, token, options.bootstrapSecret, options.bootstrapEmail);
              if (enrollment.kind === "request") return { data: { ...candidate, name: enrollment.requestedName } };
            } catch {
              throw new APIError("FORBIDDEN", { message: "An approved activation code is required" });
            }
          },
        },
      },
      account: {
        create: {
          after: async (createdAccount, context) => {
            if (createdAccount.providerId !== "credential") return;
            const token = context?.headers?.get("x-drivebox-enrollment")
              ?? context?.request?.headers.get("x-drivebox-enrollment")
              ?? "";
            const [createdUser] = await options.database.select({ id: user.id, email: user.email })
              .from(user)
              .where(eq(user.id, createdAccount.userId))
              .limit(1);
            if (!createdUser) throw new APIError("UNPROCESSABLE_ENTITY", { message: "Account activation failed" });
            try {
              await activateEnrollment(options.database, createdUser, token, options.bootstrapSecret, options.bootstrapEmail);
            } catch (cause) {
              await options.database.delete(user).where(eq(user.id, createdAccount.userId));
              throw cause;
            }
          },
        },
      },
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
    bootstrapSecret: env.SUPERADMIN_BOOTSTRAP_TOKEN,
    bootstrapEmail: env.SUPERADMIN_BOOTSTRAP_EMAIL,
  });
}

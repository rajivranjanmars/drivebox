import { Effect } from "effect";
import { env } from "cloudflare:workers";
import { getDatabase } from "@/db";
import { fileServiceLayer } from "@/server/file-service";
import type { ObjectStorage } from "@/server/object-storage";
import { makeS3ObjectStorage } from "@/server/s3-object-storage";

function requireSetting(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} must be configured`);
  return value.trim();
}

/** Creates storage for any SigV4 S3-compatible endpoint, including R2. */
export function resolveObjectStorage(runtimeEnv: CloudflareEnv): ObjectStorage {
  const addressingStyle = runtimeEnv.S3_ADDRESSING_STYLE?.trim().toLowerCase() || "path";
  if (addressingStyle !== "path" && addressingStyle !== "virtual") {
    throw new Error("S3_ADDRESSING_STYLE must be path or virtual");
  }

  return makeS3ObjectStorage({
    endpoint: requireSetting(runtimeEnv.S3_ENDPOINT, "S3_ENDPOINT"),
    region: requireSetting(runtimeEnv.S3_REGION, "S3_REGION"),
    bucket: requireSetting(runtimeEnv.S3_BUCKET, "S3_BUCKET"),
    accessKeyId: requireSetting(runtimeEnv.S3_ACCESS_KEY_ID, "S3_ACCESS_KEY_ID"),
    secretAccessKey: requireSetting(runtimeEnv.S3_SECRET_ACCESS_KEY, "S3_SECRET_ACCESS_KEY"),
    sessionToken: runtimeEnv.S3_SESSION_TOKEN?.trim() || undefined,
    addressingStyle,
  });
}

/** Executes a file workflow with request-local database and storage adapters. */
export function runFileEffect<A, E>(effect: Effect.Effect<A, E, import("@/server/file-service").FileService>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(fileServiceLayer(getDatabase(), resolveObjectStorage(env)))));
}

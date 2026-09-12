import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createDatabase } from "@/db";
import { user, userProfiles } from "@/db/schema";
import { claimLegacySuperadmin } from "@/server/governance";

describe("legacy superadmin claim", (): void => {
  it("never infers apex authority and allows only the configured operator to claim it once", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const secret = "legacy-bootstrap-secret-that-is-at-least-thirty-two-characters";
    await database.insert(user).values([
      { id: "legacy-first", name: "First signup", email: "first@example.com" },
      { id: "legacy-operator", name: "Operator", email: "operator@example.com" },
    ]);

    expect(await database.select().from(userProfiles)).toEqual([]);
    await expect(claimLegacySuperadmin(database, { id: "legacy-first", email: "first@example.com" }, secret, secret, "operator@example.com"))
      .rejects.toMatchObject({ code: "forbidden" });
    await expect(claimLegacySuperadmin(database, { id: "legacy-operator", email: "operator@example.com" }, secret, secret, "operator@example.com"))
      .resolves.toBeUndefined();
    expect(await database.select().from(userProfiles)).toEqual([expect.objectContaining({ userId: "legacy-operator", role: "superadmin" })]);
    await expect(claimLegacySuperadmin(database, { id: "legacy-operator", email: "operator@example.com" }, secret, secret, "operator@example.com"))
      .rejects.toMatchObject({ code: "conflict" });
  });
});

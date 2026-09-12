import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "@/db";
import { accountRequests, auditEvents, notifications, user, userProfiles } from "@/db/schema";
import {
  decideAccountRequest,
  activateEnrollment,
  GovernanceError,
  getGovernanceDashboard,
  markNotificationRead,
  requestChildAccount,
  reissueAccountInvitation,
  resolveDriveAccess,
  validateEnrollment,
} from "@/server/governance";

const ids = {
  root: "governance-root",
  admin: "governance-admin",
  nested: "governance-nested",
  sibling: "governance-sibling",
  member: "governance-member",
};

async function seedHierarchy(): Promise<void> {
  const database = createDatabase(env.DB);
  await database.insert(user).values([
    { id: ids.root, name: "Root", email: "root@governance.test" },
    { id: ids.admin, name: "Admin", email: "admin@governance.test" },
    { id: ids.nested, name: "Nested", email: "nested@governance.test" },
    { id: ids.sibling, name: "Sibling", email: "sibling@governance.test" },
    { id: ids.member, name: "Member", email: "member@governance.test" },
  ]).onConflictDoNothing();
  await database.insert(userProfiles).values([
    { userId: ids.root, role: "superadmin", status: "active" },
    { userId: ids.admin, parentUserId: ids.root, tenantRootId: ids.admin, role: "admin", status: "active", createdByUserId: ids.root },
    { userId: ids.nested, parentUserId: ids.admin, tenantRootId: ids.admin, role: "admin", status: "active", createdByUserId: ids.admin },
    { userId: ids.sibling, parentUserId: ids.root, tenantRootId: ids.sibling, role: "admin", status: "active", createdByUserId: ids.root },
    { userId: ids.member, parentUserId: ids.admin, tenantRootId: ids.admin, role: "member", status: "active", createdByUserId: ids.admin },
  ]).onConflictDoNothing();
}

describe("hierarchical account governance", (): void => {
  it("routes requests to the immediate parent and prevents member creation", async (): Promise<void> => {
    await seedHierarchy();
    const database = createDatabase(env.DB);

    await expect(requestChildAccount(database, ids.member, {
      name: "Blocked Child",
      email: "blocked-child@governance.test",
      role: "member",
    })).rejects.toMatchObject({ code: "forbidden" });

    const topLevelRequest = await requestChildAccount(database, ids.admin, {
      name: "Top Child",
      email: "top-child@governance.test",
      role: "member",
    });
    expect(topLevelRequest).toMatchObject({ approverId: ids.root, status: "pending" });

    const nestedRequest = await requestChildAccount(database, ids.nested, {
      name: "Nested Child",
      email: "nested-child@governance.test",
      role: "admin",
    });
    expect(nestedRequest).toMatchObject({ approverId: ids.admin, status: "pending" });
    await expect(decideAccountRequest(database, ids.root, nestedRequest.id, "approve"))
      .rejects.toMatchObject({ code: "not-found" });

    const approved = await decideAccountRequest(database, ids.root, topLevelRequest.id, "approve");
    expect(approved.status).toBe("approved");
    expect(approved.invitationToken).toBeTruthy();
    await expect(validateEnrollment(
      database,
      "top-child@governance.test",
      approved.invitationToken ?? "",
    )).resolves.toMatchObject({ kind: "request", requestId: topLevelRequest.id });
    await expect(decideAccountRequest(database, ids.root, topLevelRequest.id, "approve"))
      .rejects.toMatchObject({ code: "conflict" });
    const rotated = await reissueAccountInvitation(database, ids.admin, topLevelRequest.id, (await getGovernanceDashboard(database, ids.admin)).requests.find((request) => request.id === topLevelRequest.id)?.transitionNonce ?? "");
    await expect(validateEnrollment(database, "top-child@governance.test", approved.invitationToken ?? ""))
      .rejects.toMatchObject({ code: "forbidden" });
    await expect(validateEnrollment(database, "top-child@governance.test", rotated.invitationToken))
      .resolves.toMatchObject({ requestId: topLevelRequest.id });
  });

  it("allows only direct-child read access and keeps parent and siblings private", async (): Promise<void> => {
    await seedHierarchy();
    const database = createDatabase(env.DB);
    await expect(resolveDriveAccess(database, ids.root, ids.admin)).resolves.toMatchObject({ access: "child-read" });
    await expect(resolveDriveAccess(database, ids.admin, ids.nested)).resolves.toMatchObject({ access: "child-read" });
    await expect(resolveDriveAccess(database, ids.nested, ids.root)).rejects.toBeInstanceOf(GovernanceError);
    await expect(resolveDriveAccess(database, ids.admin, ids.sibling)).rejects.toMatchObject({ code: "not-found" });
    await expect(resolveDriveAccess(database, ids.member, ids.admin)).rejects.toMatchObject({ code: "not-found" });
  });

  it("returns a hierarchical branch without broadening drive access", async (): Promise<void> => {
    await seedHierarchy();
    const dashboard = await getGovernanceDashboard(createDatabase(env.DB), ids.root);
    expect(dashboard.hierarchy.map(({ id, depth }) => ({ id, depth }))).toEqual(expect.arrayContaining([
      { id: ids.admin, depth: 0 },
      { id: ids.sibling, depth: 0 },
      { id: ids.nested, depth: 1 },
      { id: ids.member, depth: 1 },
    ]));
    await expect(resolveDriveAccess(createDatabase(env.DB), ids.root, ids.nested)).rejects.toMatchObject({ code: "not-found" });
  });

  it("expires stale invitations so the email can be requested again", async (): Promise<void> => {
    await seedHierarchy();
    const database = createDatabase(env.DB);
    const first = await requestChildAccount(database, ids.root, { name: "Expired", email: "expired@example.com", role: "member" });
    await database.update(accountRequests).set({ invitationExpiresAt: new Date(0) }).where(eq(accountRequests.id, first.id));
    await expect(requestChildAccount(database, ids.root, { name: "Replacement", email: "expired@example.com", role: "member" }))
      .resolves.toMatchObject({ status: "approved" });
  });

  it("keeps notifications recipient-scoped", async (): Promise<void> => {
    await seedHierarchy();
    const database = createDatabase(env.DB);
    await requestChildAccount(database, ids.nested, {
      name: "Notification Child",
      email: "notification-child@governance.test",
      role: "member",
    });
    const rows = await database.select().from(notifications);
    const notification = rows.find((row) => row.recipientUserId === ids.admin);
    expect(notification).toBeTruthy();
    if (!notification) throw new Error("Expected notification");
    await expect(markNotificationRead(database, ids.sibling, notification.id)).rejects.toMatchObject({ code: "not-found" });
    await expect(markNotificationRead(database, ids.admin, notification.id)).resolves.toBeUndefined();
  });

  it("commits exactly one concurrent decision and only its matching side effects", async (): Promise<void> => {
    await seedHierarchy();
    const database = createDatabase(env.DB);
    const request = await requestChildAccount(database, ids.admin, { name: "Racing child", email: "decision-race@example.com", role: "member" });
    const outcomes = await Promise.allSettled([
      decideAccountRequest(database, ids.root, request.id, "approve"),
      decideAccountRequest(database, ids.root, request.id, "reject", "Rejected concurrently"),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const [stored] = await database.select().from(accountRequests).where(eq(accountRequests.id, request.id));
    const decisionNotifications = (await database.select().from(notifications).where(eq(notifications.requestId, request.id)))
      .filter((row) => row.type === "request-approved" || row.type === "request-rejected");
    const decisionAudits = (await database.select().from(auditEvents).where(eq(auditEvents.requestId, request.id)))
      .filter((row) => row.action === "account-request.approved" || row.action === "account-request.rejected");
    expect(decisionNotifications).toHaveLength(1);
    expect(decisionAudits).toHaveLength(1);
    expect(decisionNotifications[0]?.type).toBe(stored.status === "approved" ? "request-approved" : "request-rejected");
  });

  it("allows only one reissue for a shared request version", async (): Promise<void> => {
    await seedHierarchy();
    const database = createDatabase(env.DB);
    const request = await requestChildAccount(database, ids.root, { name: "Reissue race", email: "reissue-race@example.com", role: "member" });
    const outcomes = await Promise.allSettled([
      reissueAccountInvitation(database, ids.root, request.id, request.transitionNonce),
      reissueAccountInvitation(database, ids.root, request.id, request.transitionNonce),
    ]);
    const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<{ invitationToken: string }> => outcome.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    await expect(validateEnrollment(database, "reissue-race@example.com", fulfilled[0]?.value.invitationToken ?? ""))
      .resolves.toMatchObject({ requestId: request.id });
    expect((await database.select().from(auditEvents).where(and(eq(auditEvents.requestId, request.id), eq(auditEvents.action, "account-request.invitation-rotated"))))).toHaveLength(1);
  });

  it("rejects a token rotated after validation and activates only the replacement", async (): Promise<void> => {
    await seedHierarchy();
    const database = createDatabase(env.DB);
    const request = await requestChildAccount(database, ids.root, { name: "Rotation target", email: "rotation-target@example.com", role: "member" });
    await expect(validateEnrollment(database, "rotation-target@example.com", request.invitationToken ?? "")).resolves.toBeTruthy();
    const replacement = await reissueAccountInvitation(database, ids.root, request.id, request.transitionNonce);
    await database.insert(user).values({ id: "rotation-target", name: "Rotation target", email: "rotation-target@example.com" });
    await expect(activateEnrollment(database, { id: "rotation-target", email: "rotation-target@example.com" }, request.invitationToken ?? ""))
      .rejects.toMatchObject({ code: "forbidden" });
    expect(await database.select().from(userProfiles).where(eq(userProfiles.userId, "rotation-target"))).toEqual([]);
    await expect(activateEnrollment(database, { id: "rotation-target", email: "rotation-target@example.com" }, replacement.invitationToken)).resolves.toBeUndefined();
    expect(await database.select().from(userProfiles).where(eq(userProfiles.userId, "rotation-target"))).toHaveLength(1);
  });
});

import { and, desc, eq, gt, lte, or, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import type { Database } from "@/db";
import {
  accountRequests,
  auditEvents,
  notifications,
  user,
  userProfiles,
} from "@/db/schema";

export type UserRole = "superadmin" | "admin" | "member";
export type AccountRequestStatus = "pending" | "approved" | "activated" | "rejected" | "cancelled" | "expired";
export type DriveAccess = "owner" | "child-read";

export class GovernanceError extends Error {
  public constructor(
    public readonly code: "conflict" | "forbidden" | "invalid" | "not-found",
    message: string,
  ) {
    super(message);
    this.name = "GovernanceError";
  }
}

export interface UserProfile {
  readonly userId: string;
  readonly parentUserId: string | null;
  readonly tenantRootId: string | null;
  readonly role: UserRole;
  readonly status: "active" | "suspended";
}

export interface AccountProposal {
  readonly email: string;
  readonly name: string;
  readonly role: "admin" | "member";
}

export type EnrollmentValidation =
  | { readonly kind: "bootstrap"; readonly requestId: null }
  | { readonly kind: "request"; readonly requestId: string; readonly requestedName: string; readonly tokenHash: string };

export interface RequestResult {
  readonly id: string;
  readonly approverId: string | null;
  readonly invitationToken: string | null;
  readonly requestedRole: "admin" | "member";
  readonly status: "pending" | "approved";
  readonly transitionNonce: string;
}

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new GovernanceError("invalid", "A valid email address is required");
  const email = value.trim().normalize("NFKC").toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new GovernanceError("invalid", "A valid email address is required");
  }
  return email;
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") throw new GovernanceError("invalid", "A name is required");
  const name = value.trim().normalize("NFC").replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) throw new GovernanceError("invalid", "Name must be 2 to 120 characters");
  return name;
}

function parseRole(value: unknown): "admin" | "member" {
  if (value !== "admin" && value !== "member") throw new GovernanceError("invalid", "Role must be admin or member");
  return value;
}

function createToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secretsMatch(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(right)),
  ]);
  return timingSafeEqual(new Uint8Array(leftHash), new Uint8Array(rightHash));
}

export async function getUserProfile(database: Database, userId: string): Promise<UserProfile | null> {
  const [profile] = await database
    .select({
      userId: userProfiles.userId,
      parentUserId: userProfiles.parentUserId,
      tenantRootId: userProfiles.tenantRootId,
      role: userProfiles.role,
      status: userProfiles.status,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return profile as UserProfile | null;
}

async function requireActiveProfile(database: Database, userId: string): Promise<UserProfile> {
  const profile = await getUserProfile(database, userId);
  if (profile?.status !== "active") throw new GovernanceError("forbidden", "This account is not active");
  return profile;
}

/** Creates a child-account request and computes every security-sensitive relationship server-side. */
export async function requestChildAccount(
  database: Database,
  actorUserId: string,
  proposal: AccountProposal,
): Promise<RequestResult> {
  const actor = await requireActiveProfile(database, actorUserId);
  if (actor.role !== "admin" && actor.role !== "superadmin") {
    throw new GovernanceError("forbidden", "Only admins can request users");
  }

  const normalizedEmail = normalizeEmail(proposal.email);
  const requestedName = normalizeName(proposal.name);
  const requestedRole = actor.role === "superadmin" ? "admin" : parseRole(proposal.role);
  await database.update(accountRequests).set({
    status: "expired",
    invitationTokenHash: null,
    invitationExpiresAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(accountRequests.normalizedEmail, normalizedEmail),
    eq(accountRequests.status, "approved"),
    lte(accountRequests.invitationExpiresAt, new Date()),
  ));
  const [existingUser] = await database
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${normalizedEmail}`)
    .limit(1);
  if (existingUser) throw new GovernanceError("conflict", "An account already uses that email address");

  const directFromApex = actor.role === "superadmin";
  const approverId = directFromApex ? null : actor.parentUserId;
  if (!directFromApex && !approverId) throw new GovernanceError("forbidden", "This admin has no valid approver");

  const invitationToken = directFromApex ? createToken() : null;
  const id = crypto.randomUUID();
  const transitionNonce = crypto.randomUUID();
  const requestInsert = database.insert(accountRequests).values({
    id,
    requestedName,
    requestedEmail: normalizedEmail,
    normalizedEmail,
    requestedRole,
    requesterId: actorUserId,
    parentUserId: actorUserId,
    approverId,
    tenantRootId: directFromApex ? null : actor.tenantRootId,
    status: directFromApex ? "approved" : "pending",
    transitionNonce,
    transitionActorId: actorUserId,
    decidedByUserId: directFromApex ? actorUserId : null,
    decidedAt: directFromApex ? new Date() : null,
    invitationTokenHash: invitationToken ? await sha256(invitationToken) : null,
    invitationExpiresAt: invitationToken ? new Date(Date.now() + INVITATION_LIFETIME_MS) : null,
  });
  try {
    await requestInsert;
  } catch (cause) {
    if (cause instanceof GovernanceError) throw cause;
    throw new GovernanceError("conflict", "An open request already exists for that email address");
  }

  return {
    id,
    approverId,
    invitationToken,
    requestedRole,
    status: directFromApex ? "approved" : "pending",
    transitionNonce,
  };
}

/** Resolves a request exactly once; only its designated parent approver can decide it. */
export async function decideAccountRequest(
  database: Database,
  actorUserId: string,
  requestId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<{ readonly invitationToken: string | null; readonly status: "approved" | "rejected" }> {
  const approver = await requireActiveProfile(database, actorUserId);
  if (approver.role !== "admin" && approver.role !== "superadmin") {
    throw new GovernanceError("not-found", "Request not found");
  }
  const [request] = await database
    .select()
    .from(accountRequests)
    .where(and(eq(accountRequests.id, requestId), eq(accountRequests.approverId, actorUserId)))
    .limit(1);
  if (!request) throw new GovernanceError("not-found", "Request not found");
  if (request.status !== "pending") throw new GovernanceError("conflict", "This request has already been decided");

  const decisionReason = reason?.trim().normalize("NFC") || null;
  if (decision === "reject" && (!decisionReason || decisionReason.length > 500)) {
    throw new GovernanceError("invalid", "A rejection reason is required and must be at most 500 characters");
  }

  const invitationToken = decision === "approve" ? createToken() : null;
  const status = decision === "approve" ? "approved" : "rejected";
  const transitionNonce = crypto.randomUUID();
  const updated = await database.update(accountRequests)
    .set({
      status,
      transitionNonce,
      transitionActorId: actorUserId,
      decisionReason,
      decidedByUserId: actorUserId,
      decidedAt: new Date(),
      invitationTokenHash: invitationToken ? await sha256(invitationToken) : null,
      invitationExpiresAt: invitationToken ? new Date(Date.now() + INVITATION_LIFETIME_MS) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(accountRequests.id, requestId), eq(accountRequests.status, "pending"), eq(accountRequests.transitionNonce, request.transitionNonce)))
    .returning({ id: accountRequests.id });
  if (updated.length !== 1) throw new GovernanceError("conflict", "This request has already been decided");
  return { invitationToken, status };
}

/** Rotates an approved invitation so its requester or designated approver can perform a safe handoff. */
export async function reissueAccountInvitation(
  database: Database,
  actorUserId: string,
  requestId: string,
  expectedNonce: string,
): Promise<{ readonly invitationToken: string }> {
  const actor = await requireActiveProfile(database, actorUserId);
  if (actor.role !== "admin" && actor.role !== "superadmin") throw new GovernanceError("not-found", "Request not found");
  const [request] = await database
    .select({ id: accountRequests.id, transitionNonce: accountRequests.transitionNonce })
    .from(accountRequests)
    .where(and(
      eq(accountRequests.id, requestId),
      eq(accountRequests.status, "approved"),
      or(eq(accountRequests.requesterId, actorUserId), eq(accountRequests.approverId, actorUserId)),
    ))
    .limit(1);
  if (!request) throw new GovernanceError("not-found", "Request not found");
  if (!expectedNonce || request.transitionNonce !== expectedNonce) throw new GovernanceError("conflict", "The invitation changed; refresh and try again");

  const invitationToken = createToken();
  const transitionNonce = crypto.randomUUID();
  const updated = await database.update(accountRequests).set({
      invitationTokenHash: await sha256(invitationToken),
      invitationExpiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      transitionNonce,
      transitionActorId: actorUserId,
      updatedAt: new Date(),
    }).where(and(eq(accountRequests.id, requestId), eq(accountRequests.status, "approved"), eq(accountRequests.transitionNonce, request.transitionNonce))).returning({ id: accountRequests.id });
  if (updated.length !== 1) throw new GovernanceError("conflict", "This invitation has already been used");
  return { invitationToken };
}

/** Validates an invitation or the one-time empty-database superadmin bootstrap secret. */
export async function validateEnrollment(
  database: Database,
  email: string,
  token: string,
  bootstrapSecret?: string,
  bootstrapEmail?: string,
): Promise<EnrollmentValidation> {
  const normalizedEmail = normalizeEmail(email);
  const suppliedToken = token.trim();
  if (!suppliedToken) throw new GovernanceError("forbidden", "An approved activation code is required");

  const [{ profileCount }] = await database
    .select({ profileCount: sql<number>`count(*)` })
    .from(userProfiles);
  if (
    profileCount === 0
    && bootstrapSecret
    && bootstrapSecret.length >= 32
    && (!bootstrapEmail || normalizedEmail === normalizeEmail(bootstrapEmail))
    && await secretsMatch(suppliedToken, bootstrapSecret)
  ) {
    return { kind: "bootstrap", requestId: null };
  }

  const tokenHash = await sha256(suppliedToken);
  const [request] = await database
    .select({ id: accountRequests.id, requestedName: accountRequests.requestedName })
    .from(accountRequests)
    .where(and(
      eq(accountRequests.normalizedEmail, normalizedEmail),
      eq(accountRequests.status, "approved"),
      eq(accountRequests.invitationTokenHash, tokenHash),
      gt(accountRequests.invitationExpiresAt, new Date()),
    ))
    .limit(1);
  if (!request) throw new GovernanceError("forbidden", "The activation code is invalid or expired");
  return { kind: "request", requestId: request.id, requestedName: request.requestedName, tokenHash };
}

/** Explicitly assigns apex authority to a verified pre-upgrade operator; row order is never trusted. */
export async function claimLegacySuperadmin(
  database: Database,
  actor: { readonly email: string; readonly id: string },
  token: string,
  bootstrapSecret?: string,
  bootstrapEmail?: string,
): Promise<void> {
  if (!bootstrapSecret || bootstrapSecret.length < 32 || !bootstrapEmail) {
    throw new GovernanceError("forbidden", "Legacy superadmin claim is not configured");
  }
  if (normalizeEmail(actor.email) !== normalizeEmail(bootstrapEmail) || !await secretsMatch(token.trim(), bootstrapSecret)) {
    throw new GovernanceError("forbidden", "Legacy superadmin claim was rejected");
  }
  const [{ profileCount }] = await database.select({ profileCount: sql<number>`count(*)` }).from(userProfiles);
  if (profileCount !== 0) throw new GovernanceError("conflict", "The superadmin has already been established");
  const [identity] = await database.select({ id: user.id }).from(user).where(and(eq(user.id, actor.id), sql`lower(${user.email}) = ${normalizeEmail(actor.email)}`)).limit(1);
  if (!identity) throw new GovernanceError("forbidden", "Legacy superadmin claim was rejected");
  try {
    await database.batch([
      database.insert(userProfiles).values({ userId: actor.id, role: "superadmin", status: "active" }),
      database.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: actor.id, action: "superadmin.legacy-claimed", targetUserId: actor.id }),
    ]);
  } catch {
    throw new GovernanceError("conflict", "The superadmin has already been established");
  }
}

/** Attaches the hierarchy profile after Better Auth has created an approved identity. */
export async function activateEnrollment(
  database: Database,
  createdUser: { readonly email: string; readonly id: string },
  token: string,
  bootstrapSecret?: string,
  bootstrapEmail?: string,
): Promise<void> {
  const validation = await validateEnrollment(database, createdUser.email, token, bootstrapSecret, bootstrapEmail);
  if (validation.kind === "bootstrap") {
    await database.batch([
      database.insert(userProfiles).values({ userId: createdUser.id, role: "superadmin", status: "active" }),
      database.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: createdUser.id, action: "superadmin.bootstrapped", targetUserId: createdUser.id }),
    ]);
    return;
  }

  const transitionNonce = crypto.randomUUID();
  const updated = await database.update(accountRequests)
    .set({
      status: "activated",
      activatedUserId: createdUser.id,
      invitationTokenHash: null,
      invitationExpiresAt: null,
      transitionNonce,
      transitionActorId: createdUser.id,
      updatedAt: new Date(),
    })
    .where(and(
      eq(accountRequests.id, validation.requestId),
      eq(accountRequests.status, "approved"),
      eq(accountRequests.invitationTokenHash, validation.tokenHash),
      gt(accountRequests.invitationExpiresAt, new Date()),
    ))
    .returning({ id: accountRequests.id });
  if (updated.length !== 1) throw new GovernanceError("conflict", "This invitation has already been used");
}

/** Resolves owner or direct-child read access without leaking unrelated profiles. */
export async function resolveDriveAccess(
  database: Database,
  actorUserId: string,
  requestedOwnerId?: string | null,
): Promise<{ readonly access: DriveAccess; readonly ownerId: string; readonly ownerName: string }> {
  const actor = await requireActiveProfile(database, actorUserId);
  const ownerId = requestedOwnerId || actorUserId;
  if (ownerId === actorUserId) {
    const [owner] = await database.select({ name: user.name }).from(user).where(eq(user.id, ownerId)).limit(1);
    if (!owner) throw new GovernanceError("not-found", "Drive not found");
    return { access: "owner", ownerId, ownerName: owner.name };
  }
  if (actor.role !== "admin" && actor.role !== "superadmin") throw new GovernanceError("not-found", "Drive not found");

  const [child] = await database
    .select({ name: user.name })
    .from(userProfiles)
    .innerJoin(user, eq(user.id, userProfiles.userId))
    .where(and(
      eq(userProfiles.userId, ownerId),
      eq(userProfiles.parentUserId, actorUserId),
      eq(userProfiles.status, "active"),
    ))
    .limit(1);
  if (!child) throw new GovernanceError("not-found", "Drive not found");
  return { access: "child-read", ownerId, ownerName: child.name };
}

/** Returns only governance rows relevant to the signed-in actor. */
export async function getGovernanceDashboard(database: Database, actorUserId: string) {
  const profile = await requireActiveProfile(database, actorUserId);
  const children = await database
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: userProfiles.role,
      status: userProfiles.status,
      createdAt: userProfiles.createdAt,
    })
    .from(userProfiles)
    .innerJoin(user, eq(user.id, userProfiles.userId))
    .where(eq(userProfiles.parentUserId, actorUserId))
    .orderBy(user.name);
  const hierarchy = profile.role === "member" ? [] : await database.all<{
    depth: number;
    email: string;
    id: string;
    name: string;
    parentUserId: string;
    role: string;
    status: string;
  }>(sql`
    WITH RECURSIVE branch(user_id, parent_user_id, role, status, depth) AS (
      SELECT user_id, parent_user_id, role, status, 0
      FROM user_profiles
      WHERE parent_user_id = ${actorUserId}
      UNION ALL
      SELECT child.user_id, child.parent_user_id, child.role, child.status, branch.depth + 1
      FROM user_profiles child
      JOIN branch ON child.parent_user_id = branch.user_id
    )
    SELECT branch.user_id AS id, branch.parent_user_id AS parentUserId, branch.role, branch.status,
      branch.depth, user.name, user.email
    FROM branch JOIN user ON user.id = branch.user_id
    ORDER BY branch.depth, user.name
  `);
  const requests = await database
    .select({
      id: accountRequests.id,
      requestedName: accountRequests.requestedName,
      requestedEmail: accountRequests.requestedEmail,
      requestedRole: accountRequests.requestedRole,
      requesterId: accountRequests.requesterId,
      parentUserId: accountRequests.parentUserId,
      approverId: accountRequests.approverId,
      tenantRootId: accountRequests.tenantRootId,
      status: accountRequests.status,
      transitionNonce: accountRequests.transitionNonce,
      decisionReason: accountRequests.decisionReason,
      decidedByUserId: accountRequests.decidedByUserId,
      decidedAt: accountRequests.decidedAt,
      invitationExpiresAt: accountRequests.invitationExpiresAt,
      activatedUserId: accountRequests.activatedUserId,
      createdAt: accountRequests.createdAt,
      updatedAt: accountRequests.updatedAt,
    })
    .from(accountRequests)
    .where(or(eq(accountRequests.requesterId, actorUserId), eq(accountRequests.approverId, actorUserId)))
    .orderBy(desc(accountRequests.createdAt));
  const inbox = await database
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, actorUserId))
    .orderBy(desc(notifications.createdAt));
  return { profile, children, hierarchy, requests, notifications: inbox };
}

export async function markNotificationRead(database: Database, actorUserId: string, notificationId: string): Promise<void> {
  const updated = await database
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.recipientUserId, actorUserId)))
    .returning({ id: notifications.id });
  if (updated.length !== 1) throw new GovernanceError("not-found", "Notification not found");
}

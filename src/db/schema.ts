import { relations, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const nowInMilliseconds = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(nowInMilliseconds)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(nowInMilliseconds)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = sqliteTable(
  "rateLimit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [index("rate_limit_key_idx").on(table.key)],
);

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    parentUserId: text("parent_user_id").references((): AnySQLiteColumn => user.id, { onDelete: "restrict" }),
    tenantRootId: text("tenant_root_id").references((): AnySQLiteColumn => user.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    status: text("status").default("active").notNull(),
    createdByUserId: text("created_by_user_id").references((): AnySQLiteColumn => user.id, { onDelete: "set null" }),
    activatedAt: integer("activated_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("user_profiles_role_check", sql`${table.role} in ('superadmin', 'admin', 'member')`),
    check("user_profiles_status_check", sql`${table.status} in ('active', 'suspended')`),
    uniqueIndex("user_profiles_single_superadmin")
      .on(table.role)
      .where(sql`${table.role} = 'superadmin'`),
    index("user_profiles_parent_idx").on(table.parentUserId),
    index("user_profiles_tenant_idx").on(table.tenantRootId),
  ],
);

export const accountRequests = sqliteTable(
  "account_requests",
  {
    id: text("id").primaryKey(),
    requestedName: text("requested_name").notNull(),
    requestedEmail: text("requested_email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    requestedRole: text("requested_role").notNull(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    parentUserId: text("parent_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    approverId: text("approver_id").references(() => user.id, { onDelete: "restrict" }),
    tenantRootId: text("tenant_root_id").references(() => user.id, { onDelete: "restrict" }),
    status: text("status").default("pending").notNull(),
    transitionNonce: text("transition_nonce").notNull(),
    transitionActorId: text("transition_actor_id").references(() => user.id, { onDelete: "set null" }),
    decisionReason: text("decision_reason"),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    invitationTokenHash: text("invitation_token_hash").unique(),
    invitationExpiresAt: integer("invitation_expires_at", { mode: "timestamp_ms" }),
    activatedUserId: text("activated_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("account_requests_role_check", sql`${table.requestedRole} in ('admin', 'member')`),
    check("account_requests_status_check", sql`${table.status} in ('pending', 'approved', 'activated', 'rejected', 'cancelled', 'expired')`),
    uniqueIndex("account_requests_open_email_unique")
      .on(table.normalizedEmail)
      .where(sql`${table.status} in ('pending', 'approved')`),
    index("account_requests_requester_idx").on(table.requesterId, table.createdAt),
    index("account_requests_approver_status_idx").on(table.approverId, table.status, table.createdAt),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    requestId: text("request_id").references(() => accountRequests.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
  },
  (table) => [
    uniqueIndex("notifications_recipient_dedupe_unique").on(table.recipientUserId, table.dedupeKey),
    index("notifications_recipient_created_idx").on(table.recipientUserId, table.createdAt),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetUserId: text("target_user_id").references(() => user.id, { onDelete: "set null" }),
    requestId: text("request_id").references(() => accountRequests.id, { onDelete: "set null" }),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, string | number | boolean | null>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
  },
  (table) => [
    index("audit_events_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_events_request_idx").on(table.requestId),
  ],
);

export const releaseDismissals = sqliteTable(
  "release_dismissals",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    dismissedAt: integer("dismissed_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.version] })],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    filename: text("filename").notNull(),
    relativePath: text("relative_path").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
  },
  (table) => [
    index("files_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("files_user_path_unique").on(table.userId, table.relativePath),
  ],
);

export const uploadSessions = sqliteTable(
  "upload_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerUploadId: text("provider_upload_id").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    relativePath: text("relative_path").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    partSize: integer("part_size").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").default("active").notNull(),
    fileId: text("file_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("upload_sessions_user_fingerprint_unique").on(table.userId, table.fingerprint),
    index("upload_sessions_user_status_idx").on(table.userId, table.status),
  ],
);

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
  },
  (table) => [uniqueIndex("folders_user_path_unique").on(table.userId, table.path)],
);

export const uploadParts = sqliteTable(
  "upload_parts",
  {
    uploadId: text("upload_id")
      .notNull()
      .references(() => uploadSessions.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(nowInMilliseconds)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.uploadId, table.partNumber] })],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  files: many(files),
  folders: many(folders),
  uploadSessions: many(uploadSessions),
  notifications: many(notifications),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  user: one(user, {
    fields: [files.userId],
    references: [user.id],
  }),
}));

export const foldersRelations = relations(folders, ({ one }) => ({
  user: one(user, {
    fields: [folders.userId],
    references: [user.id],
  }),
}));

export const uploadSessionsRelations = relations(uploadSessions, ({ many, one }) => ({
  user: one(user, {
    fields: [uploadSessions.userId],
    references: [user.id],
  }),
  parts: many(uploadParts),
}));

export const uploadPartsRelations = relations(uploadParts, ({ one }) => ({
  upload: one(uploadSessions, {
    fields: [uploadParts.uploadId],
    references: [uploadSessions.id],
  }),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  userProfiles,
  accountRequests,
  notifications,
  auditEvents,
  releaseDismissals,
  files,
  folders,
  uploadSessions,
  uploadParts,
  userRelations,
  sessionRelations,
  accountRelations,
  filesRelations,
  foldersRelations,
  uploadSessionsRelations,
  uploadPartsRelations,
};

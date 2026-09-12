CREATE TABLE `account_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_name` text NOT NULL,
	`requested_email` text NOT NULL,
	`normalized_email` text NOT NULL,
	`requested_role` text NOT NULL,
	`requester_id` text NOT NULL,
	`parent_user_id` text NOT NULL,
	`approver_id` text,
	`tenant_root_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`transition_nonce` text NOT NULL,
	`transition_actor_id` text,
	`decision_reason` text,
	`decided_by_user_id` text,
	`decided_at` integer,
	`invitation_token_hash` text,
	`invitation_expires_at` integer,
	`activated_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`requester_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approver_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tenant_root_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transition_actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activated_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "account_requests_role_check" CHECK("account_requests"."requested_role" in ('admin', 'member')),
	CONSTRAINT "account_requests_status_check" CHECK("account_requests"."status" in ('pending', 'approved', 'activated', 'rejected', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_requests_invitation_token_hash_unique` ON `account_requests` (`invitation_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_requests_open_email_unique` ON `account_requests` (`normalized_email`) WHERE "account_requests"."status" in ('pending', 'approved');--> statement-breakpoint
CREATE INDEX `account_requests_requester_idx` ON `account_requests` (`requester_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `account_requests_approver_status_idx` ON `account_requests` (`approver_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_user_id` text,
	`request_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`request_id`) REFERENCES `account_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_actor_created_idx` ON `audit_events` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_request_idx` ON `audit_events` (`request_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`request_id` text,
	`dedupe_key` text NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `account_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_recipient_dedupe_unique` ON `notifications` (`recipient_user_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `release_dismissals` (
	`user_id` text NOT NULL,
	`version` text NOT NULL,
	`dismissed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `version`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`parent_user_id` text,
	`tenant_root_id` text,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_user_id` text,
	`activated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tenant_root_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_profiles_role_check" CHECK("user_profiles"."role" in ('superadmin', 'admin', 'member')),
	CONSTRAINT "user_profiles_status_check" CHECK("user_profiles"."status" in ('active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_single_superadmin` ON `user_profiles` (`role`) WHERE "user_profiles"."role" = 'superadmin';--> statement-breakpoint
CREATE INDEX `user_profiles_parent_idx` ON `user_profiles` (`parent_user_id`);--> statement-breakpoint
CREATE INDEX `user_profiles_tenant_idx` ON `user_profiles` (`tenant_root_id`);
--> statement-breakpoint
CREATE TRIGGER `account_requests_after_insert` AFTER INSERT ON `account_requests`
BEGIN
	INSERT INTO `audit_events` (`id`, `actor_user_id`, `action`, `request_id`, `metadata`)
	VALUES (lower(hex(randomblob(16))), NEW.`requester_id`, CASE WHEN NEW.`status` = 'approved' THEN 'account-request.auto-approved' ELSE 'account-request.created' END, NEW.`id`, json_object('email', NEW.`normalized_email`, 'role', NEW.`requested_role`));
	INSERT INTO `notifications` (`id`, `recipient_user_id`, `type`, `title`, `message`, `request_id`, `dedupe_key`)
	SELECT lower(hex(randomblob(16))), NEW.`approver_id`, 'approval-requested', 'User approval needed', NEW.`requested_name` || ' was requested for your branch.', NEW.`id`, 'request:' || NEW.`id` || ':pending'
	WHERE NEW.`approver_id` IS NOT NULL AND NEW.`status` = 'pending';
END;
--> statement-breakpoint
CREATE TRIGGER `account_requests_after_decision` AFTER UPDATE OF `status` ON `account_requests`
WHEN OLD.`status` = 'pending' AND NEW.`status` IN ('approved', 'rejected')
BEGIN
	INSERT OR IGNORE INTO `notifications` (`id`, `recipient_user_id`, `type`, `title`, `message`, `request_id`, `dedupe_key`)
	VALUES (lower(hex(randomblob(16))), NEW.`requester_id`, CASE NEW.`status` WHEN 'approved' THEN 'request-approved' ELSE 'request-rejected' END, CASE NEW.`status` WHEN 'approved' THEN 'User request approved' ELSE 'User request rejected' END, CASE NEW.`status` WHEN 'approved' THEN NEW.`requested_name` || ' can now activate their account.' ELSE NEW.`requested_name` || '''s request was rejected: ' || NEW.`decision_reason` END, NEW.`id`, 'request:' || NEW.`id` || ':' || NEW.`status`);
	INSERT INTO `audit_events` (`id`, `actor_user_id`, `action`, `request_id`, `metadata`)
	VALUES (lower(hex(randomblob(16))), NEW.`decided_by_user_id`, 'account-request.' || NEW.`status`, NEW.`id`, json_object('reason', NEW.`decision_reason`));
END;
--> statement-breakpoint
CREATE TRIGGER `account_requests_after_reissue` AFTER UPDATE OF `transition_nonce` ON `account_requests`
WHEN OLD.`status` = 'approved' AND NEW.`status` = 'approved' AND OLD.`invitation_token_hash` IS NOT NEW.`invitation_token_hash`
BEGIN
	INSERT INTO `audit_events` (`id`, `actor_user_id`, `action`, `request_id`)
	VALUES (lower(hex(randomblob(16))), NEW.`transition_actor_id`, 'account-request.invitation-rotated', NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `account_requests_after_activation` AFTER UPDATE OF `status` ON `account_requests`
WHEN OLD.`status` = 'approved' AND NEW.`status` = 'activated'
BEGIN
	INSERT INTO `user_profiles` (`user_id`, `parent_user_id`, `tenant_root_id`, `role`, `status`, `created_by_user_id`)
	VALUES (NEW.`activated_user_id`, NEW.`parent_user_id`, coalesce(NEW.`tenant_root_id`, NEW.`activated_user_id`), NEW.`requested_role`, 'active', NEW.`requester_id`);
	INSERT OR IGNORE INTO `notifications` (`id`, `recipient_user_id`, `type`, `title`, `message`, `request_id`, `dedupe_key`)
	VALUES (lower(hex(randomblob(16))), NEW.`requester_id`, 'account-activated', 'Account activated', NEW.`requested_name` || ' joined your branch.', NEW.`id`, 'request:' || NEW.`id` || ':activated');
	INSERT INTO `audit_events` (`id`, `actor_user_id`, `action`, `target_user_id`, `request_id`)
	VALUES (lower(hex(randomblob(16))), NEW.`activated_user_id`, 'account.activated', NEW.`activated_user_id`, NEW.`id`);
END;

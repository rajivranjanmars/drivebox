CREATE TABLE `upload_parts` (
	`upload_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`etag` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`upload_id`, `part_number`),
	FOREIGN KEY (`upload_id`) REFERENCES `upload_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_upload_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`relative_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`part_size` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`file_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_sessions_user_fingerprint_unique` ON `upload_sessions` (`user_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `upload_sessions_user_status_idx` ON `upload_sessions` (`user_id`,`status`);--> statement-breakpoint
ALTER TABLE `files` ADD `relative_path` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `files` SET `relative_path` = `filename` WHERE `relative_path` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `files_user_path_unique` ON `files` (`user_id`,`relative_path`);

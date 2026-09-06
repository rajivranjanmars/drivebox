CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_user_path_unique` ON `folders` (`user_id`,`path`);
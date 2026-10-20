CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`issue` text NOT NULL,
	`actor` text NOT NULL,
	`status` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`issue`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`address` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`status` text DEFAULT 'New' NOT NULL,
	`photo` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);

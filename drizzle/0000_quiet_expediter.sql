CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`price` integer NOT NULL,
	`condition` text NOT NULL,
	`location` text NOT NULL,
	`description` text NOT NULL,
	`seller` text NOT NULL,
	`contact` text NOT NULL,
	`image` text,
	`created` integer NOT NULL,
	`sold` integer DEFAULT 0 NOT NULL
);

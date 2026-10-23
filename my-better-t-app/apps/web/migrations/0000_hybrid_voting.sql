CREATE TABLE `ballots` (
	`poll` text NOT NULL,
	`voter` text NOT NULL,
	`option` integer NOT NULL,
	`message` text NOT NULL,
	`signature` text NOT NULL,
	`received_at` integer NOT NULL,
	PRIMARY KEY(`poll`, `voter`),
	FOREIGN KEY (`poll`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_option" CHECK("ballots"."option" >= 0 AND "ballots"."option" < 6)
);
--> statement-breakpoint
CREATE TABLE `vote_challenges` (
	`poll` text NOT NULL,
	`voter` text NOT NULL,
	`option` integer NOT NULL,
	`message` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`poll`, `voter`),
	FOREIGN KEY (`poll`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `polls` (
	`id` text PRIMARY KEY NOT NULL,
	`creator` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`options` text NOT NULL,
	`created_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`closed` integer DEFAULT false NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`anchor_signature` text,
	`anchor_digest` text
);

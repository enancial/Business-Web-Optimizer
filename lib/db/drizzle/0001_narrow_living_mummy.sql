CREATE TABLE `report_leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`url` text NOT NULL,
	`score` integer NOT NULL,
	`report_status` text DEFAULT 'pending' NOT NULL,
	`report_email_id` text,
	`report_error` text,
	`owner_notified` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);

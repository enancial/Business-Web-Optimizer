CREATE TABLE `affiliate_conversions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`affiliate_id` integer NOT NULL,
	`stripe_customer_id` text NOT NULL,
	`stripe_subscription_id` text NOT NULL,
	`plan` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`commission_rate` real DEFAULT 0.3 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`affiliate_id`) REFERENCES `affiliates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_conversions_stripe_subscription_id_unique` ON `affiliate_conversions` (`stripe_subscription_id`);--> statement-breakpoint
CREATE TABLE `affiliate_earnings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`affiliate_id` integer NOT NULL,
	`stripe_invoice_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`commission_cents` integer NOT NULL,
	`period_month` integer NOT NULL,
	`period_year` integer NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`affiliate_id`) REFERENCES `affiliates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_earnings_stripe_invoice_id_unique` ON `affiliate_earnings` (`stripe_invoice_id`);--> statement-breakpoint
CREATE TABLE `affiliates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`website` text,
	`promotion_method` text,
	`paypal_email` text,
	`active` integer DEFAULT true NOT NULL,
	`otp_code` text,
	`otp_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliates_email_unique` ON `affiliates` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `affiliates_code_unique` ON `affiliates` (`code`);
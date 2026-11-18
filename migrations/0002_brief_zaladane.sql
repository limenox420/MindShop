CREATE TABLE `card_item` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'unsold' NOT NULL,
	`order_id` text,
	`sold_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_item_product_status_idx` ON `card_item` (`product_id`,`status`);--> statement-breakpoint
ALTER TABLE `product` ADD `type` text DEFAULT 'file' NOT NULL;
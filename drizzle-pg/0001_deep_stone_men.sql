CREATE TABLE "card_item" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'unsold' NOT NULL,
	"order_id" text,
	"sold_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "type" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_item" ADD CONSTRAINT "card_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_item" ADD CONSTRAINT "card_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_item_product_status_idx" ON "card_item" USING btree ("product_id","status");

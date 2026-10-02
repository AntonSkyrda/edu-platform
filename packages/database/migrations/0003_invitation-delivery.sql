ALTER TABLE "user_invitations" ADD COLUMN "delivery_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "delivery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "delivery_error" text;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "delivered_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "user_invitations" SET "delivery_status" = 'skipped', "delivery_error" = 'LEGACY_DELIVERY_UNTRACKED';

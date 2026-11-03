ALTER TABLE "password_resets" ADD COLUMN "dispatch_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "next_dispatch_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "last_enqueued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "notification_dispatch_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "notification_next_dispatch_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "notification_dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "notification_last_enqueued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "dispatch_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "next_dispatch_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "last_enqueued_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "resets_dispatch_idx" ON "password_resets" USING btree ("delivery_status","next_dispatch_at","id");--> statement-breakpoint
CREATE INDEX "notifications_dispatch_idx" ON "password_resets" USING btree ("notification_status","notification_next_dispatch_at","id");--> statement-breakpoint
CREATE INDEX "invitations_dispatch_idx" ON "user_invitations" USING btree ("delivery_status","next_dispatch_at","id");
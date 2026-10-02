CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"delivery_error" text,
	"delivered_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"notification_status" text,
	"notification_error" text,
	"notification_attempts" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_resets_user_id_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_resets_delivery_idx" ON "password_resets" USING btree ("delivery_status","created_at");--> statement-breakpoint
CREATE INDEX "password_resets_notification_idx" ON "password_resets" USING btree ("notification_status","created_at");
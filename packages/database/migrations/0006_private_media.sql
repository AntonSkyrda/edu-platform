DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "teachers" WHERE "photo_key" IS NOT NULL) THEN
  RAISE EXCEPTION 'Migrate existing teacher photo keys to media before applying 0006';
 END IF;
END $$;
--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('IMAGE', 'PDF');--> statement-breakpoint
CREATE TYPE "public"."media_state" AS ENUM('UPLOADING', 'READY');--> statement-breakpoint
CREATE TYPE "public"."storage_driver" AS ENUM('local', 's3');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "media_kind" NOT NULL,
	"state" "media_state" DEFAULT 'UPLOADING' NOT NULL,
	"storage_driver" "storage_driver" NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"page_count" integer,
	"expires_at" timestamp with time zone,
	CONSTRAINT "media_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "media_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"object_key" text NOT NULL,
	"storage_driver" "storage_driver" NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_deletions_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
CREATE INDEX "media_expiry_idx" ON "media" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "media_deletions_retry_idx" ON "media_deletions" USING btree ("next_attempt_at");--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" DROP COLUMN "photo_key";
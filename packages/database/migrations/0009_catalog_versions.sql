ALTER TABLE "subjects" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;

CREATE TYPE "public"."publication_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(150) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug"),
	CONSTRAINT "subjects_sort_order_check" CHECK ("subjects"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "teacher_subjects" (
	"teacher_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "teacher_subjects_teacher_id_subject_id_pk" PRIMARY KEY("teacher_id","subject_id"),
	CONSTRAINT "teacher_subjects_sort_order_check" CHECK ("teacher_subjects"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"photo_key" text,
	"short_description" varchar(500),
	"biography" text,
	"status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "teachers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subjects_public_order_idx" ON "subjects" USING btree ("status","sort_order","id");--> statement-breakpoint
CREATE INDEX "teacher_subjects_subject_order_idx" ON "teacher_subjects" USING btree ("subject_id","sort_order","teacher_id");--> statement-breakpoint
CREATE INDEX "teachers_public_order_idx" ON "teachers" USING btree ("status","last_name","id");
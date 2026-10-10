CREATE TYPE "public"."permission" AS ENUM('subjects.read', 'subjects.create', 'subjects.update', 'subjects.publish', 'subjects.delete', 'teachers.read', 'teachers.create', 'teachers.update', 'teachers.publish', 'teachers.delete', 'media.read', 'media.upload', 'media.delete');--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL,
	"permission" "permission" NOT NULL,
	CONSTRAINT "user_permissions_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
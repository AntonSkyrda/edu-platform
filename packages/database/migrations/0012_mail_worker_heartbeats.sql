CREATE TABLE "mail_worker_heartbeats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_completed_at" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"active_jobs" integer DEFAULT 0 NOT NULL
);

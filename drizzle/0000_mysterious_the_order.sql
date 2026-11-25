CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action_type" text NOT NULL,
	"title" text NOT NULL,
	"metadata" text DEFAULT '' NOT NULL,
	"summary_id" integer,
	"conversation_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"source_type" text DEFAULT 'plain_text' NOT NULL,
	"file_name" text,
	"raw_content" text NOT NULL,
	"parsed_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_language" text DEFAULT 'English' NOT NULL,
	"participant_count" integer DEFAULT 1 NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"estimated_reading_minutes" integer DEFAULT 1 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"noise_filtered_percent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"summary_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"cited_message_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text DEFAULT 'Grounded' NOT NULL,
	"provider_used" text DEFAULT 'ConvoBrief Grounded QA' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"mode" text DEFAULT 'detailed' NOT NULL,
	"length_preference" text DEFAULT 'balanced' NOT NULL,
	"custom_instructions" text DEFAULT '' NOT NULL,
	"provider_used" text DEFAULT 'ConvoBrief Hybrid NLP Engine' NOT NULL,
	"overall_importance" text DEFAULT 'High Importance' NOT NULL,
	"is_saved" boolean DEFAULT false NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"structured_result" jsonb NOT NULL,
	"processing_stats" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'Conversation Intelligence Analyst' NOT NULL,
	"organization" text DEFAULT 'ConvoBrief Workspace' NOT NULL,
	"password_hash" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"preferred_provider" text DEFAULT 'auto' NOT NULL,
	"preferred_model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"custom_base_url" text DEFAULT '' NOT NULL,
	"encrypted_api_keys" text DEFAULT '' NOT NULL,
	"privacy_zero_retention" boolean DEFAULT false NOT NULL,
	"consent_model_training" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_messages" ADD CONSTRAINT "follow_up_messages_summary_id_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_messages" ADD CONSTRAINT "follow_up_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "followup_summary_id_idx" ON "follow_up_messages" USING btree ("summary_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "summaries_user_id_idx" ON "summaries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "summaries_conversation_id_idx" ON "summaries" USING btree ("conversation_id");
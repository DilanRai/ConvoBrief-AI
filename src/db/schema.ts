import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import type {
  ParsedMessage,
  ConvoBriefStructuredResult,
  ProcessingStats,
} from "@/types/convobrief";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("Conversation Intelligence Analyst"),
  organization: text("organization").notNull().default("ConvoBrief Workspace"),
  passwordHash: text("password_hash").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  preferredProvider: text("preferred_provider").notNull().default("auto"),
  preferredModel: text("preferred_model").notNull().default("gpt-4o-mini"),
  customBaseUrl: text("custom_base_url").notNull().default(""),
  encryptedApiKeys: text("encrypted_api_keys").notNull().default(""),
  privacyZeroRetention: boolean("privacy_zero_retention").notNull().default(false),
  consentModelTraining: boolean("consent_model_training").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull().default("plain_text"),
    fileName: text("file_name"),
    rawContent: text("raw_content").notNull(),
    parsedMessages: jsonb("parsed_messages")
      .$type<ParsedMessage[]>()
      .notNull()
      .default([]),
    detectedLanguage: text("detected_language").notNull().default("English"),
    participantCount: integer("participant_count").notNull().default(1),
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    messageCount: integer("message_count").notNull().default(0),
    wordCount: integer("word_count").notNull().default(0),
    estimatedReadingMinutes: integer("estimated_reading_minutes")
      .notNull()
      .default(1),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    noiseFilteredPercent: integer("noise_filtered_percent")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("conversations_user_id_idx").on(table.userId)]
);

export const summaries = pgTable(
  "summaries",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("detailed"),
    lengthPreference: text("length_preference").notNull().default("balanced"),
    customInstructions: text("custom_instructions").notNull().default(""),
    providerUsed: text("provider_used")
      .notNull()
      .default("ConvoBrief Hybrid NLP Engine"),
    overallImportance: text("overall_importance")
      .notNull()
      .default("High Importance"),
    isSaved: boolean("is_saved").notNull().default(false),
    isEdited: boolean("is_edited").notNull().default(false),
    structuredResult: jsonb("structured_result")
      .$type<ConvoBriefStructuredResult>()
      .notNull(),
    processingStats: jsonb("processing_stats")
      .$type<ProcessingStats>()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("summaries_user_id_idx").on(table.userId),
    index("summaries_conversation_id_idx").on(table.conversationId),
  ]
);

export const followUpMessages = pgTable(
  "follow_up_messages",
  {
    id: serial("id").primaryKey(),
    summaryId: integer("summary_id")
      .notNull()
      .references(() => summaries.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    citedMessageIds: jsonb("cited_message_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    confidence: text("confidence").notNull().default("Grounded"),
    providerUsed: text("provider_used")
      .notNull()
      .default("ConvoBrief Grounded QA"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("followup_summary_id_idx").on(table.summaryId)]
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    title: text("title").notNull(),
    metadata: text("metadata").notNull().default(""),
    summaryId: integer("summary_id"),
    conversationId: integer("conversation_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("activity_logs_user_id_idx").on(table.userId)]
);

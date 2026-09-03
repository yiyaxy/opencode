import { integer, index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { ContentExtraction } from "@opencode-ai/schema/content-extraction"
import { Timestamps } from "../database/schema.sql"

export const JobTable = sqliteTable(
  "content_job",
  {
    id: text().$type<ContentExtraction.ID>().primaryKey(),
    source_hash: text().notNull(),
    source_text: text().notNull(),
    source_characters: integer().notNull(),
    estimated_tokens: integer().notNull(),
    template: text().notNull(),
    model: text().notNull(),
    status: text().$type<ContentExtraction.JobStatus>().notNull(),
    total_chunks: integer().notNull(),
    completed_chunks: integer().notNull().default(0),
    failed_chunks: integer().notNull().default(0),
    error: text({ mode: "json" }).$type<ContentExtraction.Failure>(),
    ...Timestamps,
  },
  (table) => [index("content_job_status_updated_idx").on(table.status, table.time_updated)],
)

export const ChunkTable = sqliteTable(
  "content_chunk",
  {
    id: text().primaryKey(),
    job_id: text()
      .$type<ContentExtraction.ID>()
      .notNull()
      .references(() => JobTable.id, { onDelete: "cascade" }),
    index: integer().notNull(),
    total: integer().notNull(),
    source_start: integer().notNull(),
    source_end: integer().notNull(),
    context_start: integer().notNull(),
    context_end: integer().notNull(),
    text: text().notNull(),
    estimated_tokens: integer().notNull(),
    status: text().$type<ContentExtraction.ChunkStatus>().notNull(),
    attempt: integer().notNull().default(0),
    error: text({ mode: "json" }).$type<ContentExtraction.Failure>(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("content_chunk_job_index_idx").on(table.job_id, table.index),
    index("content_chunk_job_status_idx").on(table.job_id, table.status),
  ],
)

export const ResultTable = sqliteTable(
  "content_result",
  {
    job_id: text()
      .$type<ContentExtraction.ID>()
      .notNull()
      .references(() => JobTable.id, { onDelete: "cascade" }),
    chunk_id: text()
      .notNull()
      .references(() => ChunkTable.id, { onDelete: "cascade" }),
    source_start: integer().notNull(),
    source_end: integer().notNull(),
    value: text({ mode: "json" }).$type<ContentExtraction.Result["value"]>().notNull(),
    schema_version: text().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    primaryKey({ columns: [table.job_id, table.chunk_id] }),
    index("content_result_job_source_idx").on(table.job_id, table.source_start),
  ],
)

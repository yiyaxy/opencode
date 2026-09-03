export * as ContentExtraction from "./content-extraction"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { NonNegativeInt, PositiveInt, optional, statics } from "./schema"

export const ID = Schema.String.check(Schema.isStartsWith("cex_")).pipe(
  Schema.brand("ContentExtraction.ID"),
  statics((schema) => ({ create: () => schema.make("cex_" + ascending()) })),
)
export type ID = typeof ID.Type

export const JobStatus = Schema.Literals([
  "pending",
  "splitting",
  "extracting",
  "merging",
  "completed",
  "partial",
  "failed",
  "cancelled",
])
export type JobStatus = typeof JobStatus.Type

export const ChunkStatus = Schema.Literals(["pending", "running", "completed", "failed", "cancelled"])
export type ChunkStatus = typeof ChunkStatus.Type

export const FailureClass = Schema.Literals([
  "context-overflow",
  "extraction-failed",
  "output-limit",
  "schema-invalid",
  "provider-timeout",
  "provider-rate-limit",
  "provider-server-error",
  "content-filter",
  "authentication",
  "configuration",
  "unknown",
])
export type FailureClass = typeof FailureClass.Type

export const SourceRange = Schema.Struct({
  start: NonNegativeInt,
  end: NonNegativeInt,
}).annotate({ identifier: "ContentExtraction.SourceRange" })
export interface SourceRange extends Schema.Schema.Type<typeof SourceRange> {}

export const Chunk = Schema.Struct({
  id: Schema.String,
  index: NonNegativeInt,
  total: PositiveInt,
  sourceStart: NonNegativeInt,
  sourceEnd: NonNegativeInt,
  contextStart: NonNegativeInt,
  contextEnd: NonNegativeInt,
  text: Schema.String,
  estimatedTokens: NonNegativeInt,
  status: ChunkStatus,
  attempt: NonNegativeInt,
}).annotate({ identifier: "ContentExtraction.Chunk" })
export interface Chunk extends Schema.Schema.Type<typeof Chunk> {}

export const Failure = Schema.Struct({
  class: FailureClass,
  code: Schema.String,
  message: Schema.String,
  retryable: Schema.Boolean,
  partial: Schema.Boolean,
  phase: optional(Schema.String),
}).annotate({ identifier: "ContentExtraction.Failure" })
export interface Failure extends Schema.Schema.Type<typeof Failure> {}

export const Job = Schema.Struct({
  id: ID,
  sourceHash: Schema.String,
  sourceCharacters: NonNegativeInt,
  estimatedTokens: NonNegativeInt,
  template: Schema.String,
  model: Schema.String,
  status: JobStatus,
  totalChunks: NonNegativeInt,
  completedChunks: NonNegativeInt,
  failedChunks: NonNegativeInt,
  createdAt: NonNegativeInt,
  updatedAt: NonNegativeInt,
  error: optional(Failure),
}).annotate({ identifier: "ContentExtraction.Job" })
export interface Job extends Schema.Schema.Type<typeof Job> {}

export const Result = Schema.Struct({
  jobID: ID,
  chunkID: Schema.String,
  sourceStart: NonNegativeInt,
  sourceEnd: NonNegativeInt,
  value: Schema.Json,
  schemaVersion: Schema.String,
  createdAt: NonNegativeInt,
}).annotate({ identifier: "ContentExtraction.Result" })
export interface Result extends Schema.Schema.Type<typeof Result> {}

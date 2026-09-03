export * as ContentExtractionStore from "./store"

import { ContentExtraction } from "@opencode-ai/schema/content-extraction"
import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { ChunkTable, JobTable, ResultTable } from "./sql"

export type CreateInput = {
  readonly job: ContentExtraction.Job
  readonly sourceText: string
  readonly chunks: ReadonlyArray<ContentExtraction.Chunk>
}

export type SaveChunkInput = {
  readonly jobID: ContentExtraction.ID
  readonly chunk: ContentExtraction.Chunk & { readonly error?: ContentExtraction.Failure }
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<void>
  readonly get: (id: ContentExtraction.ID) => Effect.Effect<ContentExtraction.Job | undefined>
  readonly source: (id: ContentExtraction.ID) => Effect.Effect<string | undefined>
  readonly chunks: (id: ContentExtraction.ID) => Effect.Effect<ReadonlyArray<ContentExtraction.Chunk>>
  readonly results: (id: ContentExtraction.ID) => Effect.Effect<ReadonlyArray<ContentExtraction.Result>>
  readonly saveChunk: (input: SaveChunkInput) => Effect.Effect<void>
  readonly saveResult: (result: ContentExtraction.Result) => Effect.Effect<void>
  readonly recoverRunning: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/ContentExtractionStore") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const create = Effect.fn("ContentExtractionStore.create")(function* (input: CreateInput) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .insert(JobTable)
              .values({
                id: input.job.id,
                source_hash: input.job.sourceHash,
                source_text: input.sourceText,
                source_characters: input.job.sourceCharacters,
                estimated_tokens: input.job.estimatedTokens,
                template: input.job.template,
                model: input.job.model,
                status: input.job.status,
                total_chunks: input.job.totalChunks,
                completed_chunks: input.job.completedChunks,
                failed_chunks: input.job.failedChunks,
                error: input.job.error,
                time_created: input.job.createdAt,
                time_updated: input.job.updatedAt,
              })
              .run()
            yield* Effect.forEach(input.chunks, (chunk) =>
              tx
                .insert(ChunkTable)
                .values({
                  id: chunk.id,
                  job_id: input.job.id,
                  index: chunk.index,
                  total: chunk.total,
                  source_start: chunk.sourceStart,
                  source_end: chunk.sourceEnd,
                  context_start: chunk.contextStart,
                  context_end: chunk.contextEnd,
                  text: chunk.text,
                  estimated_tokens: chunk.estimatedTokens,
                  status: chunk.status,
                  attempt: chunk.attempt,
                })
                .run(),
            )
          }),
        )
        .pipe(Effect.orDie)
    })

    const get = Effect.fn("ContentExtractionStore.get")(function* (id: ContentExtraction.ID) {
      const row = yield* db.select().from(JobTable).where(eq(JobTable.id, id)).get().pipe(Effect.orDie)
      return row ? toJob(row) : undefined
    })

    const source = Effect.fn("ContentExtractionStore.source")(function* (id: ContentExtraction.ID) {
      const row = yield* db
        .select({ source_text: JobTable.source_text })
        .from(JobTable)
        .where(eq(JobTable.id, id))
        .get()
        .pipe(Effect.orDie)
      return row?.source_text
    })

    const chunks = Effect.fn("ContentExtractionStore.chunks")(function* (id: ContentExtraction.ID) {
      const rows = yield* db
        .select()
        .from(ChunkTable)
        .where(eq(ChunkTable.job_id, id))
        .orderBy(asc(ChunkTable.index))
        .all()
        .pipe(Effect.orDie)
      return rows.map(toChunk)
    })

    const results = Effect.fn("ContentExtractionStore.results")(function* (id: ContentExtraction.ID) {
      const rows = yield* db
        .select()
        .from(ResultTable)
        .where(eq(ResultTable.job_id, id))
        .orderBy(asc(ResultTable.source_start))
        .all()
        .pipe(Effect.orDie)
      return rows.map(toResult)
    })

    const saveChunk = Effect.fn("ContentExtractionStore.saveChunk")(function* (input: SaveChunkInput) {
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .update(ChunkTable)
              .set({
                status: input.chunk.status,
                attempt: input.chunk.attempt,
                error: input.chunk.error,
                time_updated: Date.now(),
              })
              .where(eq(ChunkTable.id, input.chunk.id))
              .run()
            const rows = yield* tx
              .select({ status: ChunkTable.status })
              .from(ChunkTable)
              .where(eq(ChunkTable.job_id, input.jobID))
              .all()
            yield* tx
              .update(JobTable)
              .set({
                completed_chunks: rows.filter((row) => row.status === "completed").length,
                failed_chunks: rows.filter((row) => row.status === "failed").length,
                time_updated: Date.now(),
              })
              .where(eq(JobTable.id, input.jobID))
              .run()
          }),
        )
        .pipe(Effect.orDie)
    })

    const saveResult = Effect.fn("ContentExtractionStore.saveResult")(function* (result: ContentExtraction.Result) {
      yield* db
        .insert(ResultTable)
        .values({
          job_id: result.jobID,
          chunk_id: result.chunkID,
          source_start: result.sourceStart,
          source_end: result.sourceEnd,
          value: result.value,
          schema_version: result.schemaVersion,
          time_created: result.createdAt,
        })
        .onConflictDoUpdate({
          target: [ResultTable.job_id, ResultTable.chunk_id],
          set: {
            source_start: result.sourceStart,
            source_end: result.sourceEnd,
            value: result.value,
            schema_version: result.schemaVersion,
            time_created: result.createdAt,
          },
        })
        .run()
        .pipe(Effect.orDie)
    })

    const recoverRunning = Effect.fn("ContentExtractionStore.recoverRunning")(function* () {
      yield* db
        .update(ChunkTable)
        .set({ status: "pending", time_updated: Date.now() })
        .where(eq(ChunkTable.status, "running"))
        .run()
        .pipe(Effect.orDie)
    })

    return Service.of({ create, get, source, chunks, results, saveChunk, saveResult, recoverRunning })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

function toJob(row: typeof JobTable.$inferSelect): ContentExtraction.Job {
  return {
    id: row.id,
    sourceHash: row.source_hash,
    sourceCharacters: row.source_characters,
    estimatedTokens: row.estimated_tokens,
    template: row.template,
    model: row.model,
    status: row.status,
    totalChunks: row.total_chunks,
    completedChunks: row.completed_chunks,
    failedChunks: row.failed_chunks,
    createdAt: row.time_created,
    updatedAt: row.time_updated,
    ...(row.error ? { error: row.error } : {}),
  }
}

function toChunk(row: typeof ChunkTable.$inferSelect): ContentExtraction.Chunk {
  return {
    id: row.id,
    index: row.index,
    total: row.total,
    sourceStart: row.source_start,
    sourceEnd: row.source_end,
    contextStart: row.context_start,
    contextEnd: row.context_end,
    text: row.text,
    estimatedTokens: row.estimated_tokens,
    status: row.status,
    attempt: row.attempt,
  }
}

function toResult(row: typeof ResultTable.$inferSelect): ContentExtraction.Result {
  return {
    jobID: row.job_id,
    chunkID: row.chunk_id,
    sourceStart: row.source_start,
    sourceEnd: row.source_end,
    value: row.value,
    schemaVersion: row.schema_version,
    createdAt: row.time_created,
  }
}

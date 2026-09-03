import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260903070956_content_extraction",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`content_chunk\` (
          \`id\` text PRIMARY KEY,
          \`job_id\` text NOT NULL,
          \`index\` integer NOT NULL,
          \`total\` integer NOT NULL,
          \`source_start\` integer NOT NULL,
          \`source_end\` integer NOT NULL,
          \`context_start\` integer NOT NULL,
          \`context_end\` integer NOT NULL,
          \`text\` text NOT NULL,
          \`estimated_tokens\` integer NOT NULL,
          \`status\` text NOT NULL,
          \`attempt\` integer DEFAULT 0 NOT NULL,
          \`error\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_content_chunk_job_id_content_job_id_fk\` FOREIGN KEY (\`job_id\`) REFERENCES \`content_job\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`content_job\` (
          \`id\` text PRIMARY KEY,
          \`source_hash\` text NOT NULL,
          \`source_text\` text NOT NULL,
          \`source_characters\` integer NOT NULL,
          \`estimated_tokens\` integer NOT NULL,
          \`template\` text NOT NULL,
          \`model\` text NOT NULL,
          \`status\` text NOT NULL,
          \`total_chunks\` integer NOT NULL,
          \`completed_chunks\` integer DEFAULT 0 NOT NULL,
          \`failed_chunks\` integer DEFAULT 0 NOT NULL,
          \`error\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`content_result\` (
          \`job_id\` text NOT NULL,
          \`chunk_id\` text NOT NULL,
          \`source_start\` integer NOT NULL,
          \`source_end\` integer NOT NULL,
          \`value\` text NOT NULL,
          \`schema_version\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`content_result_pk\` PRIMARY KEY(\`job_id\`, \`chunk_id\`),
          CONSTRAINT \`fk_content_result_job_id_content_job_id_fk\` FOREIGN KEY (\`job_id\`) REFERENCES \`content_job\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_content_result_chunk_id_content_chunk_id_fk\` FOREIGN KEY (\`chunk_id\`) REFERENCES \`content_chunk\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE UNIQUE INDEX \`content_chunk_job_index_idx\` ON \`content_chunk\` (\`job_id\`,\`index\`);`)
      yield* tx.run(`CREATE INDEX \`content_chunk_job_status_idx\` ON \`content_chunk\` (\`job_id\`,\`status\`);`)
      yield* tx.run(`CREATE INDEX \`content_job_status_updated_idx\` ON \`content_job\` (\`status\`,\`time_updated\`);`)
      yield* tx.run(
        `CREATE INDEX \`content_result_job_source_idx\` ON \`content_result\` (\`job_id\`,\`source_start\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration

export * as ContentExtraction from "./content-extraction"

import { Chunk, FailureClass } from "@opencode-ai/schema/content-extraction"

const DEFAULT_TARGET_TOKENS = 6_000
const DEFAULT_MAX_TOKENS = 8_000
const DEFAULT_OVERLAP_TOKENS = 300
const UNITS_PER_TOKEN = 4

export type SplitOptions = {
  readonly targetTokens?: number
  readonly maxTokens?: number
  readonly overlapTokens?: number
  readonly jobID?: string
}

export type Normalized = {
  readonly text: string
  readonly characters: number
  readonly estimatedTokens: number
}

export type FailureInput = {
  readonly code?: string
  readonly phase?: string
  readonly partial?: boolean
  readonly status?: number
  readonly message?: string
}

export type FailureDecision = {
  readonly classification: typeof FailureClass.Type
  readonly retryable: boolean
  readonly preservePartial: boolean
  readonly action: "retry" | "split" | "format-repair" | "stop"
}

type Point = {
  readonly start: number
  readonly end: number
  readonly character: number
  readonly units: number
  readonly value: string
}

export function normalize(input: string): Normalized {
  const text = input.replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n")
  return {
    text,
    characters: Array.from(text).length,
    estimatedTokens: estimateTokens(text),
  }
}

export function estimateTokens(input: string) {
  let units = 0
  for (const value of input) units += tokenUnits(value)
  return Math.max(0, Math.ceil(units / UNITS_PER_TOKEN))
}

export function classifyFailure(input: FailureInput): FailureDecision {
  const code = input.code?.toLowerCase()
  const message = input.message?.toLowerCase() ?? ""
  const status = input.status
  const preservePartial = input.partial === true

  if (code === "context_length_exceeded" || status === 413 || message.includes("context window")) {
    return { classification: "context-overflow", retryable: false, preservePartial, action: "split" }
  }

  if (code === "content_generation_failed" && input.phase?.toLowerCase() === "extracting") {
    return { classification: "extraction-failed", retryable: true, preservePartial: true, action: "retry" }
  }

  if (code === "invalid_json" || code === "schema_invalid" || code === "structured_output_invalid") {
    return { classification: "schema-invalid", retryable: true, preservePartial, action: "format-repair" }
  }

  if (code === "content_filter" || code === "content-filter" || code === "safety" || code === "blocked") {
    return { classification: "content-filter", retryable: false, preservePartial, action: "stop" }
  }

  if (status === 401 || status === 403 || code === "unauthorized" || code === "forbidden") {
    return { classification: "authentication", retryable: false, preservePartial, action: "stop" }
  }

  if (status === 408 || message.includes("timeout") || message.includes("timed out")) {
    return { classification: "provider-timeout", retryable: true, preservePartial, action: "retry" }
  }

  if (status === 429 || code === "rate_limit_exceeded") {
    return { classification: "provider-rate-limit", retryable: true, preservePartial, action: "retry" }
  }

  if (status !== undefined && status >= 500 && status <= 599) {
    return { classification: "provider-server-error", retryable: true, preservePartial, action: "retry" }
  }

  if (code === "output_limit" || code === "max_tokens" || message.includes("max output")) {
    return { classification: "output-limit", retryable: false, preservePartial, action: "split" }
  }

  return { classification: "unknown", retryable: false, preservePartial, action: "stop" }
}

export function split(input: string, options: SplitOptions = {}) {
  const normalized = normalize(input)
  if (normalized.text.length === 0) return []

  const points = buildPoints(normalized.text)
  const prefix = buildPrefix(points)
  const boundaries = buildBoundaries(points)
  const targetTokens = positive(options.targetTokens, DEFAULT_TARGET_TOKENS)
  const maxTokens = Math.max(targetTokens, positive(options.maxTokens, DEFAULT_MAX_TOKENS))
  const overlapTokens = Math.min(Math.max(0, options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS), targetTokens - 1)
  const targetUnits = targetTokens * UNITS_PER_TOKEN
  const maxUnits = maxTokens * UNITS_PER_TOKEN
  const overlapUnits = overlapTokens * UNITS_PER_TOKEN
  const minimumBoundaryUnits = Math.max(UNITS_PER_TOKEN, Math.floor(targetUnits / 4))

  const chunks: Array<Omit<typeof Chunk.Type, "index" | "total" | "status" | "attempt">> = []
  let sourceStart = 0

  while (sourceStart < points.length) {
    const contextStart = findContextStart(sourceStart, overlapUnits, prefix)
    const preferredEnd = findEnd(contextStart, targetUnits, prefix)
    const hardEnd = findEnd(contextStart, maxUnits, prefix)
    const end =
      chooseBoundary(sourceStart, preferredEnd, boundaries, prefix, minimumBoundaryUnits) ??
      chooseBoundary(sourceStart, hardEnd, boundaries, prefix, minimumBoundaryUnits) ??
      Math.max(sourceStart + 1, preferredEnd)
    const context = points[contextStart]
    const last = points[end - 1]
    if (!context || !last) break

    const source = points[sourceStart]
    if (!source) break
    chunks.push({
      id: options.jobID ? `${options.jobID}:chunk:${chunks.length}` : `chunk:${chunks.length}`,
      sourceStart: source.character,
      sourceEnd: last.character + 1,
      contextStart: context.character,
      contextEnd: last.character + 1,
      text: normalized.text.slice(context.start, last.end),
      estimatedTokens: estimateTokens(normalized.text.slice(context.start, last.end)),
    })
    sourceStart = end
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    index,
    total: chunks.length,
    status: "pending" as const,
    attempt: 0,
  }))
}

function positive(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function buildPoints(input: string) {
  const points: Point[] = []
  let start = 0
  let character = 0
  for (const value of input) {
    const end = start + value.length
    points.push({ start, end, character, units: tokenUnits(value), value })
    start = end
    character++
  }
  return points
}

function buildPrefix(points: readonly Point[]) {
  const prefix = [0]
  for (const point of points) prefix.push(prefix[prefix.length - 1]! + point.units)
  return prefix
}

function buildBoundaries(points: readonly Point[]) {
  const boundaries = [0]
  points.forEach((point, index) => {
    if (point.value === "\n" || /[。！？.!?]/u.test(point.value)) boundaries.push(index + 1)
  })
  if (boundaries[boundaries.length - 1] !== points.length) boundaries.push(points.length)
  return boundaries
}

function findContextStart(sourceStart: number, overlapUnits: number, prefix: readonly number[]) {
  if (sourceStart === 0 || overlapUnits === 0) return sourceStart
  let candidate = sourceStart
  while (candidate > 0 && prefix[sourceStart]! - prefix[candidate - 1]! <= overlapUnits) candidate--
  return candidate
}

function findEnd(start: number, budgetUnits: number, prefix: readonly number[]) {
  let end = start
  while (end < prefix.length - 1 && prefix[end + 1]! - prefix[start]! <= budgetUnits) end++
  return end
}

function chooseBoundary(
  sourceStart: number,
  limit: number,
  boundaries: readonly number[],
  prefix: readonly number[],
  minimumUnits: number,
) {
  let selected: number | undefined
  for (const boundary of boundaries) {
    if (boundary <= sourceStart) continue
    if (boundary > limit) break
    if (prefix[boundary]! - prefix[sourceStart]! < minimumUnits) continue
    selected = boundary
  }
  return selected
}

function tokenUnits(value: string) {
  const codePoint = value.codePointAt(0) ?? 0
  if (/[A-Za-z0-9]/u.test(value)) return 1
  if (/[\t\n\r ]/u.test(value)) return 1
  if (codePoint > 0xffff) return 8
  if (/[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(value)) return 4
  return 2
}

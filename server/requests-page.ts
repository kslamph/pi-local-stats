import type { SqliteDatabase } from "./database.ts"
import { nullableNumber, numeric, projectLabel } from "./stats-values.ts"
import type {
  RequestLogRow,
  RequestPageOptions,
  RequestRange,
  RequestsResponse,
  RequestSortKey,
  StatsFilters,
} from "./types.ts"

export const REQUEST_PAGE_SIZE = 20

const requestSortKeys: RequestSortKey[] = [
  "timestamp",
  "duration",
  "totalTokens",
  "cost",
  "cacheReadTokens",
]

const requestOrderBy: Record<RequestSortKey, string> = {
  timestamp: "timestamp",
  duration: "duration_ms",
  totalTokens: "total_tokens",
  cost: "cost",
  cacheReadTokens: "cache_read_tokens",
}

const isoDay = /^\d{4}-\d{2}-\d{2}$/

export function localDayString(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function localMidnight(day: string): Date | null {
  if (!isoDay.test(day)) return null
  const [year, month, date] = day.split("-").map(Number)
  const parsed = new Date(year!, month! - 1, date!)
  if (Number.isNaN(parsed.getTime())) return null
  // Rejects overflowing dates such as 2026-02-30, which Date would roll over.
  return localDayString(parsed) === day ? parsed : null
}

export function todayRange(): RequestRange {
  const today = localDayString()
  return { from: today, to: today }
}

export function parseRequestPageOptions(
  search: URLSearchParams
): RequestPageOptions | null {
  const defaults = todayRange()
  const from = search.get("from") ?? defaults.from
  const to = search.get("to") ?? defaults.to
  const start = localMidnight(from)
  const end = localMidnight(to)
  if (!start || !end || start > end) return null

  const page = search.has("page") ? Number(search.get("page")) : 1
  const sort = (search.get("sort") ?? "timestamp") as RequestSortKey
  const direction = search.get("direction") ?? "desc"
  if (!Number.isSafeInteger(page) || page < 1) return null
  if (!requestSortKeys.includes(sort)) return null
  if (direction !== "asc" && direction !== "desc") return null

  return {
    from,
    to,
    page,
    pageSize: REQUEST_PAGE_SIZE,
    sort,
    direction,
  }
}

function rangeBounds(options: RequestPageOptions): {
  clause: string
  values: string[]
} {
  const end = localMidnight(options.to)!
  end.setDate(end.getDate() + 1)
  return {
    clause: " WHERE timestamp >= ? AND timestamp < ?",
    values: [localMidnight(options.from)!.toISOString(), end.toISOString()],
  }
}

function where(
  filters: StatsFilters,
  range: { clause: string; values: string[] }
): { clause: string; values: string[] } {
  const predicates = [range.clause.replace(" WHERE ", "")]
  const values = [...range.values]
  for (const [key, value] of Object.entries({
    project: filters.project,
    provider: filters.provider,
    model: filters.model,
  }))
    if (value) {
      predicates.push(`${key} = ?`)
      values.push(value)
    }
  return { clause: ` WHERE ${predicates.join(" AND ")}`, values }
}

export function getRequests(
  db: SqliteDatabase,
  filters: StatsFilters,
  options: RequestPageOptions
): RequestsResponse {
  const scoped = where(filters, rangeBounds(options))
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS rows,
        COALESCE(SUM(request_count), 0) AS requests,
        COALESCE(SUM(is_error), 0) AS errors,
        COALESCE(SUM(total_tokens), 0) AS tokens,
        COALESCE(SUM(cost), 0) AS cost,
        COALESCE(AVG(duration_ms), 0) AS average_duration_ms,
        COALESCE(MAX(duration_ms), 0) AS max_duration_ms
      FROM accounted_usage${scoped.clause}`
    )
    .get(...scoped.values) as Record<string, unknown>

  const total = numeric(totals.rows)
  const pageCount = Math.max(1, Math.ceil(total / options.pageSize))
  const page = Math.min(options.page, pageCount)
  const direction = options.direction === "asc" ? "ASC" : "DESC"
  const rows: RequestLogRow[] = (
    db
      .prepare(
        `SELECT * FROM accounted_usage${scoped.clause}
          ORDER BY ${requestOrderBy[options.sort]} ${direction},
            timestamp DESC, id, session_id
          LIMIT ? OFFSET ?`
      )
      .all(
        ...scoped.values,
        options.pageSize,
        (page - 1) * options.pageSize
      ) as Array<Record<string, unknown>>
  ).map((row) => {
    const project = String(row.project ?? "")
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      project,
      label: projectLabel(project),
      timestamp: String(row.timestamp),
      provider: String(row.provider),
      model: String(row.model),
      inputTokens: numeric(row.input_tokens),
      outputTokens: nullableNumber(row.output_tokens),
      cacheReadTokens: numeric(row.cache_read_tokens),
      cacheWriteTokens: nullableNumber(row.cache_write_tokens),
      totalTokens: numeric(row.total_tokens),
      cost: numeric(row.cost),
      isError: Boolean(row.is_error),
      durationMs: numeric(row.duration_ms),
      requestCount: Math.max(1, numeric(row.request_count)),
    }
  })

  return {
    rows,
    page,
    pageSize: options.pageSize,
    total,
    range: { from: options.from, to: options.to },
    totals: {
      rows: total,
      requests: numeric(totals.requests),
      errors: numeric(totals.errors),
      tokens: numeric(totals.tokens),
      cost: numeric(totals.cost),
      averageDurationMs: numeric(totals.average_duration_ms),
      maxDurationMs: numeric(totals.max_duration_ms),
    },
  }
}
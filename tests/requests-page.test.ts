import { describe, expect, it } from "vitest"

import { createDatabase } from "../server/database.ts"
import {
  REQUEST_PAGE_SIZE,
  getRequests,
  parseRequestPageOptions,
} from "../server/requests-page.ts"
import type {
  RequestSortKey,
  SortDirection,
  StatsFilters,
} from "../server/types.ts"

const filters: StatsFilters = {
  range: "all",
  project: "",
  provider: "",
  model: "",
}

function localDay(offsetDays = 0): Date {
  const now = new Date()
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetDays,
    12,
    0,
    0,
    0
  )
}

function localDayString(offsetDays = 0): string {
  const date = localDay(offsetDays)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function options(
  sort: RequestSortKey = "timestamp",
  direction: SortDirection = "desc",
  page = 1
) {
  return {
    from: localDayString(0),
    to: localDayString(0),
    page,
    pageSize: REQUEST_PAGE_SIZE,
    sort,
    direction,
  }
}

interface SeedRequest {
  id: string
  timestamp: string
  provider?: string
  model?: string
  cwd?: string
  inputTokens?: number
  outputTokens?: number | null
  cacheReadTokens?: number
  cacheWriteTokens?: number | null
  totalTokens?: number
  cost?: number
  isError?: number
  durationMs?: number
}

function seed(db: ReturnType<typeof createDatabase>, requests: SeedRequest[]) {
  const insertSession = db.prepare(
    "INSERT INTO sessions (file_path, session_id, cwd, name, started_at, parent_session, accounting_session_id) VALUES (?, ?, ?, ?, ?, NULL, ?)"
  )
  const insertRequest = db.prepare(
    `INSERT INTO requests (id, source_key, request_key, file_path, session_id,
      accounting_session_id, cwd, timestamp, provider, model, input_tokens,
      output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost,
      is_error, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const request of requests) {
    const cwd = request.cwd ?? "/work/project"
    const file = `/sessions/${request.id}.jsonl`
    insertSession.run(file, request.id, cwd, request.id, request.timestamp, request.id)
    insertRequest.run(
      request.id,
      request.id,
      request.id,
      file,
      request.id,
      request.id,
      cwd,
      request.timestamp,
      request.provider ?? "test",
      request.model ?? "model",
      request.inputTokens ?? 10,
      request.outputTokens === undefined ? 5 : request.outputTokens,
      request.cacheReadTokens ?? 0,
      request.cacheWriteTokens === undefined
        ? 0
        : request.cacheWriteTokens,
      request.totalTokens ?? 15,
      request.cost ?? 0.01,
      request.isError ?? 0,
      request.durationMs ?? 1_000
    )
  }
}

describe("parseRequestPageOptions", () => {
  it("defaults to today and accepts explicit ranges, pages and sorts", () => {
    const today = localDayString(0)
    expect(parseRequestPageOptions(new URLSearchParams())).toEqual({
      from: today,
      to: today,
      page: 1,
      pageSize: REQUEST_PAGE_SIZE,
      sort: "timestamp",
      direction: "desc",
    })
    expect(
      parseRequestPageOptions(
        new URLSearchParams(
          "from=2026-01-05&to=2026-01-31&page=3&sort=duration&direction=asc"
        )
      )
    ).toEqual({
      from: "2026-01-05",
      to: "2026-01-31",
      page: 3,
      pageSize: REQUEST_PAGE_SIZE,
      sort: "duration",
      direction: "asc",
    })
  })

  it("rejects malformed dates, inverted ranges, pages and sorts", () => {
    for (const query of [
      "from=2026-13-01",
      "from=2026-02-30",
      "from=yesterday",
      "to=20260101",
      "from=2026-01-31&to=2026-01-05",
      "page=0",
      "page=1.5",
      "page=abc",
      "sort=provider",
      "sort=cacheWriteTokens",
      "sort=inputTokens",
      "direction=sideways",
    ])
      expect(parseRequestPageOptions(new URLSearchParams(query))).toBeNull()
  })
})

describe("getRequests", () => {
  it("returns today's rows by default, newest first, twenty per page", () => {
    const db = createDatabase(":memory:")
    try {
      seed(
        db,
        Array.from({ length: 23 }, (_, index) => ({
          id: `today-${String(index).padStart(2, "0")}`,
          timestamp: new Date(
            localDay(0).getTime() + index * 60_000
          ).toISOString(),
          cost: index / 100,
          durationMs: (index + 1) * 100,
        })).concat([
          {
            id: "yesterday-00",
            timestamp: localDay(-1).toISOString(),
            cost: 99,
            durationMs: 99_000,
          },
        ])
      )

      const firstPage = getRequests(db, filters, options())
      expect(firstPage.range).toEqual({
        from: localDayString(0),
        to: localDayString(0),
      })
      expect(firstPage).toMatchObject({
        page: 1,
        pageSize: 20,
        total: 23,
      })
      expect(firstPage.rows).toHaveLength(20)
      expect(firstPage.rows[0]?.id).toBe("today-22")
      expect(firstPage.rows.at(-1)?.id).toBe("today-03")
      expect(firstPage.totals).toMatchObject({
        rows: 23,
        requests: 23,
        errors: 0,
      })
      expect(firstPage.totals.cost).toBeCloseTo(
        Array.from({ length: 23 }, (_, index) => index / 100).reduce(
          (total, value) => total + value,
          0
        ),
        6
      )
      expect(firstPage.totals.averageDurationMs).toBeCloseTo(1_200, 6)
      expect(firstPage.totals.maxDurationMs).toBe(2_300)

      const lastPage = getRequests(db, filters, options("timestamp", "desc", 99))
      expect(lastPage).toMatchObject({ page: 2, total: 23 })
      expect(lastPage.rows.map(({ id }) => id)).toEqual([
        "today-02",
        "today-01",
        "today-00",
      ])
    } finally {
      db.close()
    }
  })

  it("covers an explicit multi-day range with inclusive local bounds", () => {
    const db = createDatabase(":memory:")
    try {
      seed(
        db,
        [-2, -1, 0, 1].map((offset) => ({
          id: `day${offset}`,
          timestamp: localDay(offset).toISOString(),
        }))
      )
      const response = getRequests(db, filters, {
        ...options(),
        from: localDayString(-2),
        to: localDayString(0),
      })

      expect(response.total).toBe(3)
      expect(response.rows.map(({ id }) => id)).toEqual([
        "day0",
        "day-1",
        "day-2",
      ])
      expect(response.totals.requests).toBe(3)
    } finally {
      db.close()
    }
  })

  it("applies the shared project, provider and model filters", () => {
    const db = createDatabase(":memory:")
    try {
      seed(db, [
        { id: "a", timestamp: localDay(0).toISOString() },
        {
          id: "b",
          timestamp: localDay(0).toISOString(),
          provider: "openai",
          model: "gpt-6-luna",
          cwd: "/work/other",
        },
        {
          id: "c",
          timestamp: localDay(0).toISOString(),
          provider: "openai",
          model: "gpt-5.6-terra",
        },
      ])

      expect(
        getRequests(db, { ...filters, provider: "openai" }, options()).rows.map(
          ({ id }) => id
        )
      ).toEqual(["b", "c"])
      expect(
        getRequests(db, { ...filters, model: "gpt-5.6-terra" }, options()).rows
      ).toHaveLength(1)
      expect(
        getRequests(db, { ...filters, project: "/work/other" }, options()).rows
      ).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it("sorts on every allowlisted column", () => {
    const db = createDatabase(":memory:")
    try {
      const base = localDay(0).getTime()
      const at = (minutes: number) =>
        new Date(base + minutes * 60_000).toISOString()
      seed(db, [
        {
          id: "slow",
          timestamp: at(1),
          durationMs: 9_000,
          cost: 0.5,
          inputTokens: 10,
          cacheReadTokens: 1,
          totalTokens: 11,
        },
        {
          id: "fast",
          timestamp: at(3),
          durationMs: 1_000,
          cost: 0.1,
          inputTokens: 90,
          cacheReadTokens: 9,
          totalTokens: 104,
        },
        {
          id: "middle",
          timestamp: at(2),
          durationMs: 4_000,
          cost: 0.9,
          inputTokens: 50,
          cacheReadTokens: 5,
          totalTokens: 55,
        },
      ])

      const ids = (sort: RequestSortKey, direction: SortDirection) =>
        getRequests(db, filters, options(sort, direction)).rows.map(
          ({ id }) => id
        )

      expect(ids("duration", "desc")).toEqual(["slow", "middle", "fast"])
      expect(ids("duration", "asc")).toEqual(["fast", "middle", "slow"])
      expect(ids("cost", "desc")).toEqual(["middle", "slow", "fast"])
      expect(ids("cacheReadTokens", "desc")).toEqual(["fast", "middle", "slow"])
      expect(ids("totalTokens", "desc")).toEqual(["fast", "middle", "slow"])
      expect(ids("totalTokens", "asc")).toEqual(["slow", "middle", "fast"])
      expect(ids("timestamp", "desc")).toEqual(["fast", "middle", "slow"])
    } finally {
      db.close()
    }
  })

  it("breaks ties by newest first, then by id, so paging is stable", () => {
    const db = createDatabase(":memory:")
    try {
      const base = localDay(0).getTime()
      seed(db, [
        {
          id: "older",
          timestamp: new Date(base + 60_000).toISOString(),
          durationMs: 5_000,
        },
        {
          id: "newer",
          timestamp: new Date(base + 120_000).toISOString(),
          durationMs: 5_000,
        },
      ])

      expect(
        getRequests(db, filters, options("duration", "desc")).rows.map(
          ({ id }) => id
        )
      ).toEqual(["newer", "older"])

      const shared = new Date(base + 180_000).toISOString()
      db.prepare("DELETE FROM requests").run()
      seed(db, [
        { id: "b", timestamp: shared, durationMs: 7 },
        { id: "a", timestamp: shared, durationMs: 7 },
      ])
      expect(
        getRequests(db, filters, options("duration", "asc")).rows.map(
          ({ id }) => id
        )
      ).toEqual(["a", "b"])
    } finally {
      db.close()
    }
  })

  it("reports raw usage, errors and unknown values without editing them", () => {
    const db = createDatabase(":memory:")
    try {
      seed(db, [
        {
          id: "failed",
          timestamp: localDay(0).toISOString(),
          inputTokens: 1,
          outputTokens: null,
          cacheReadTokens: 2,
          cacheWriteTokens: null,
          totalTokens: 3,
          cost: 0,
          isError: 1,
          durationMs: 42_565_539,
        },
        { id: "ok", timestamp: localDay(0).toISOString() },
      ])

      const rows = getRequests(db, filters, options()).rows
      const failed = rows.find(({ id }) => id === "failed")
      const ok = rows.find(({ id }) => id === "ok")

      expect(failed).toMatchObject({
        sessionId: "failed",
        project: "/work/project",
        label: "project",
        provider: "test",
        model: "model",
        inputTokens: 1,
        outputTokens: null,
        cacheReadTokens: 2,
        cacheWriteTokens: null,
        totalTokens: 3,
        cost: 0,
        isError: true,
        durationMs: 42_565_539,
        requestCount: 1,
      })
      expect(ok).toMatchObject({ isError: false, durationMs: 1_000 })
      expect(getRequests(db, filters, options()).totals.errors).toBe(1)
    } finally {
      db.close()
    }
  })

  it("hides hidden models and deduplicates requests recorded twice", () => {
    const db = createDatabase(":memory:")
    try {
      const timestamp = localDay(0).toISOString()
      seed(db, [
        { id: "kept", timestamp },
        { id: "hidden", timestamp, model: "secret" },
        { id: "duplicate", timestamp },
      ])
      db.prepare(
        "INSERT INTO sessions (file_path, session_id, cwd, name, started_at, parent_session, accounting_session_id) VALUES ('/sessions/duplicate-copy.jsonl', 'duplicate-copy', '/work/project', 'copy', ?, 'kept', 'duplicate')"
      ).run(timestamp)
      db.prepare(
        `INSERT INTO requests (id, source_key, request_key, file_path, session_id,
          accounting_session_id, cwd, timestamp, provider, model, input_tokens,
          output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost,
          is_error, duration_ms)
        VALUES ('duplicate', 'duplicate', 'duplicate', '/sessions/duplicate-copy.jsonl',
          'duplicate-copy', 'duplicate', '/work/project', ?, 'test', 'model',
          10, 5, 0, 0, 15, 0.01, 0, 1000)`
      ).run(timestamp)
      db.prepare(
        "INSERT INTO hidden_models (provider, model, hidden_at) VALUES ('test', 'secret', '2026-01-01T00:00:00.000Z')"
      ).run()

      const rows = getRequests(db, filters, options()).rows
      expect(rows.map(({ id }) => id)).toEqual(["duplicate", "kept"])
      expect(
        rows.filter(({ id }) => id === "duplicate")
      ).toHaveLength(1)
      expect(getRequests(db, filters, options()).total).toBe(2)
    } finally {
      db.close()
    }
  })

  it("returns an empty page outside the indexed range", () => {
    const db = createDatabase(":memory:")
    try {
      seed(db, [{ id: "today", timestamp: localDay(0).toISOString() }])
      const response = getRequests(db, filters, {
        ...options(),
        from: localDayString(-30),
        to: localDayString(-10),
      })

      expect(response.rows).toEqual([])
      expect(response).toMatchObject({ page: 1, total: 0 })
      expect(response.totals).toMatchObject({
        rows: 0,
        requests: 0,
        errors: 0,
        tokens: 0,
        cost: 0,
        averageDurationMs: 0,
        maxDurationMs: 0,
      })
    } finally {
      db.close()
    }
  })
})
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  RequestsPage,
  RequestsTable,
} from "../src/components/dashboard/RequestsPage.tsx"
import { requestRangePresets } from "../src/lib/request-range.ts"
import { todayString } from "../src/lib/dashboard-url.ts"
import { I18nProvider } from "../src/lib/i18n.tsx"
import type {
  RequestLogRow,
  RequestPageOptions,
  RequestsResponse,
  RequestSortKey,
  SortDirection,
} from "../src/types.ts"

const row: RequestLogRow = {
  id: "request-1",
  sessionId: "session-1",
  project: "/work/pi-local-stats",
  label: "pi-local-stats",
  timestamp: "2026-10-04T17:15:51.028Z",
  provider: "zenfree",
  model: "space-bunny-free",
  inputTokens: 18_685,
  outputTokens: 252,
  cacheReadTokens: 182,
  cacheWriteTokens: 0,
  totalTokens: 19_119,
  cost: 0.0123,
  isError: false,
  durationMs: 6_097,
  requestCount: 1,
}

function renderTable({
  rows = [row],
  total = 1,
  page = 1,
  pageSize = 20,
  sort = "timestamp",
  direction = "desc",
}: Partial<{
  rows: RequestLogRow[]
  total: number
  page: number
  pageSize: number
  sort: RequestSortKey
  direction: SortDirection
}> = {}) {
  return renderToStaticMarkup(
    <I18nProvider>
      <RequestsTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        direction={direction}
        isLoading={false}
        onPageChange={() => {}}
        onSortChange={() => {}}
      />
    </I18nProvider>
  )
}

function renderPage(data: RequestsResponse | null, requestPage: RequestPageOptions) {
  return renderToStaticMarkup(
    <I18nProvider>
      <RequestsPage
        data={data}
        requestPage={requestPage}
        isLoading={false}
        onPageChange={() => {}}
        onSortChange={() => {}}
        onRangeChange={() => {}}
      />
    </I18nProvider>
  )
}

describe("request range presets", () => {
  it("covers today, seven days and thirty days ending today", () => {
    expect(
      requestRangePresets("2026-10-04", {
        today: "Today",
        last7Days: "Last 7 days",
        last30Days: "Last 30 days",
      })
    ).toEqual([
      { id: "today", label: "Today", from: "2026-10-04", to: "2026-10-04" },
      {
        id: "7d",
        label: "Last 7 days",
        from: "2026-09-28",
        to: "2026-10-04",
      },
      {
        id: "30d",
        label: "Last 30 days",
        from: "2026-09-05",
        to: "2026-10-04",
      },
    ])
  })

  it("crosses month and year boundaries", () => {
    expect(
      requestRangePresets("2026-01-03", {
        today: "Today",
        last7Days: "Last 7 days",
        last30Days: "Last 30 days",
      }).map(({ from }) => from)
    ).toEqual(["2026-01-03", "2025-12-28", "2025-12-05"])
  })
})

describe("requests table", () => {
  it("shows provider, model, token split, duration and cost per request", () => {
    const markup = renderTable()

    expect(markup).toContain('aria-label="Sort by Date"')
    expect(markup).toContain(">Provider / Model</th>")
    expect(markup).toContain('aria-label="Sort by In / out"')
    expect(markup).toContain('aria-label="Sort by Cache r/w"')
    expect(markup).toContain(">Status</th>")
    expect(markup).toContain('aria-label="Sort by Duration"')
    expect(markup).toContain('aria-label="Sort by Cost"')
    expect(markup).toContain("zenfree")
    expect(markup).toContain("space-bunny-free")
    expect(markup).toContain("18.7K / 252")
    expect(markup).toContain("182 / 0")
    expect(markup).toContain("19.1K")
    expect(markup).toContain("6.1 s")
    expect(markup).toContain("$0.01")
  })

  it("marks errors with a red dot and successes with a green dot", () => {
    const ok = renderTable()
    const failed = renderTable({
      rows: [{ ...row, isError: true, cost: 0 }],
    })

    expect(ok).toContain('role="img" aria-label="OK"')
    expect(ok).toContain("bg-emerald-600")
    expect(ok).not.toContain("bg-destructive")
    expect(failed).toContain('role="img" aria-label="Error"')
    expect(failed).toContain("bg-destructive")
    expect(failed).not.toContain("bg-emerald-600")
  })

  it("keeps unknown values as dashes and flags aggregated agent runs", () => {
    const markup = renderTable({
      rows: [
        {
          ...row,
          outputTokens: null,
          cacheWriteTokens: null,
          requestCount: 12,
          durationMs: 42_565_539,
        },
      ],
    })

    expect(markup).toContain("18.7K / —")
    expect(markup).toContain("182 / —")
    expect(markup).toContain("11.8 hr")
    expect(markup).toContain("×12")
    expect(markup).toContain(
      "Accounts for 12 requests recorded as one agent run"
    )
  })

  it("marks the sorted column and offers every sortable column", () => {
    const markup = renderTable({ sort: "duration", direction: "asc" })

    expect(markup).toContain('aria-sort="ascending"')
    expect(markup).toContain('aria-label="Sort by Duration"')
    expect(markup).toContain('aria-label="Sort by Cost"')
    expect(markup).toContain('aria-label="Sort by Date"')
    expect(markup).toContain('aria-sort="none"')
  })

  it("paginates at the page size returned by the server", () => {
    const single = renderTable({ total: 20 })
    expect(single).not.toContain("<nav")

    const paged = renderTable({ total: 57_931, page: 2 })
    expect(paged).toContain('aria-label="Pagination"')
    expect(paged).toContain("Page 2 of 2897")
  })

  it("explains an empty range", () => {
    const markup = renderTable({ rows: [], total: 0 })
    expect(markup).toContain("No requests")
  })
})

describe("requests page", () => {
  const today = todayString()
  const requestPage: RequestPageOptions = {
    from: today,
    to: today,
    page: 1,
    pageSize: 20,
    sort: "timestamp",
    direction: "desc",
  }

  it("defaults to today and exposes both date bounds and presets", () => {
    const markup = renderPage(null, requestPage)

    expect(markup).toContain("Date range")
    expect(markup).toContain('aria-label="From date"')
    expect(markup).toContain('aria-label="To date"')
    expect(markup).toContain(`value="${today}"`)
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain("Last 7 days")
    expect(markup).toContain("Last 30 days")
  })

  it("presses no preset for a custom range", () => {
    const markup = renderPage(null, {
      ...requestPage,
      from: "2020-01-01",
      to: "2020-01-31",
    })

    expect(markup).toContain('value="2020-01-01"')
    expect(markup).toContain('value="2020-01-31"')
    expect(markup).not.toContain('aria-pressed="true"')
    expect(markup).toContain('aria-pressed="false"')
  })

  it("summarizes the whole selected range, not the visible page", () => {
    const data: RequestsResponse = {
      rows: [row],
      page: 1,
      pageSize: 20,
      total: 2_142,
      range: { from: "2026-10-04", to: "2026-10-04" },
      totals: {
        rows: 2_142,
        requests: 2_142,
        errors: 38,
        tokens: 41_000_000,
        cost: 0.46,
        averageDurationMs: 15_000,
        maxDurationMs: 425_000,
      },
    }
    const markup = renderPage(data, requestPage)

    expect(markup).toContain("Selected range")
    expect(markup).toContain("2,142 requests")
    expect(markup).toContain("38 errors")
    expect(markup).toContain("41M tokens")
    expect(markup).toContain("Average duration: 15 s")
    expect(markup).toContain("Max duration: 7.1 min")
  })
})
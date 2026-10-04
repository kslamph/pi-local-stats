import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"

import { EmptyRows } from "@/components/dashboard/EmptyRows"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Pagination } from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { todayString } from "@/lib/dashboard-url"
import { requestRangePresets } from "@/lib/request-range"
import { useI18n } from "@/lib/i18n"
import type {
  RequestLogRow,
  RequestPageOptions,
  RequestsResponse,
  RequestSortKey,
  SortDirection,
} from "@/types"

export function RequestStatusDot({ isError }: { isError: boolean }) {
  const { messages: t } = useI18n()
  const label = isError ? t.requestError : t.requestOk
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="img"
        aria-label={label}
        className={`inline-block size-2.5 rounded-full ${
          isError ? "bg-destructive" : "bg-emerald-600 dark:bg-emerald-500"
        }`}
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function RequestRangePicker({
  from,
  to,
  onRangeChange,
}: {
  from: string
  to: string
  onRangeChange: (from: string, to: string) => void
}) {
  const { messages: t } = useI18n()
  const today = todayString()
  const ranges = requestRangePresets(today, {
    today: t.today,
    last7Days: t.last7Days,
    last30Days: t.last30Days,
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="requests-from">
          {t.fromDate}
        </label>
        <input
          id="requests-from"
          type="date"
          value={from}
          max={to}
          aria-label={t.fromDate}
          className="h-8 rounded-lg border bg-card px-2 text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => onRangeChange(event.target.value, to)}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="requests-to">
          {t.toDate}
        </label>
        <input
          id="requests-to"
          type="date"
          value={to}
          min={from}
          aria-label={t.toDate}
          className="h-8 rounded-lg border bg-card px-2 text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => onRangeChange(from, event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        {ranges.map((preset) => (
          <Button
            key={preset.id}
            variant="outline"
            className="h-8 px-3"
            aria-pressed={from === preset.from && to === preset.to}
            onClick={() => onRangeChange(preset.from, preset.to)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function RequestTotals({ totals }: { totals: RequestsResponse["totals"] }) {
  const { messages: t, format } = useI18n()
  const entries = [
    t.rangeRequests(format.number(totals.requests), totals.requests),
    t.rangeTokens(format.compact(totals.tokens)),
    t.rangeCost(format.currency(totals.cost)),
    t.rangeErrors(format.number(totals.errors), totals.errors),
    `${t.averageDuration}: ${format.duration(totals.averageDurationMs)}`,
    `${t.maxDuration}: ${format.duration(totals.maxDurationMs)}`,
  ]

  return (
    <dl
      aria-label={t.rangeTotals}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums"
    >
      {entries.map((entry) => (
        <div key={entry} className="flex items-center gap-1.5">
          <dt className="sr-only">{entry}</dt>
          <dd className="text-foreground">{entry}</dd>
        </div>
      ))}
    </dl>
  )
}

export function RequestsTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  direction,
  isLoading,
  onPageChange,
  onSortChange,
}: {
  rows: RequestLogRow[]
  total: number
  page: number
  pageSize: number
  sort: RequestSortKey
  direction: SortDirection
  isLoading: boolean
  onPageChange: (page: number) => void
  onSortChange: (sort: RequestSortKey, direction: SortDirection) => void
}) {
  const { messages: t, format } = useI18n()
  if (total === 0) return <EmptyRows kind="request" />

  const pageCount = Math.ceil(total / pageSize)
  const columns: Array<{
    key: RequestSortKey | null
    label: string
    numeric?: boolean
  }> = [
    { key: "timestamp", label: t.date },
    { key: null, label: `${t.provider} / ${t.model}` },
    { key: "totalTokens", label: t.inputOutputTokens, numeric: true },
    { key: "cacheReadTokens", label: t.cacheReadWrite, numeric: true },
    { key: null, label: t.status },
    { key: "duration", label: t.duration, numeric: true },
    { key: "cost", label: t.cost, numeric: true },
  ]

  return (
    <>
      <Table aria-busy={isLoading}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              if (!column.key)
                return (
                  <TableHead key={column.label}>{column.label}</TableHead>
                )
              const active = sort === column.key
              const SortIcon = !active
                ? ArrowUpDownIcon
                : direction === "asc"
                  ? ArrowUpIcon
                  : ArrowDownIcon
              return (
                <TableHead
                  key={column.key}
                  aria-sort={
                    active
                      ? direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={column.numeric ? "text-right" : undefined}
                >
                  <button
                    type="button"
                    className={`flex w-full cursor-pointer items-center gap-1 hover:text-primary ${column.numeric ? "justify-end" : ""}`}
                    aria-label={t.sortBy(column.label)}
                    onClick={() =>
                      onSortChange(
                        column.key!,
                        active && direction === "asc" ? "desc" : "asc"
                      )
                    }
                  >
                    {column.label}
                    <SortIcon className="size-3.5" aria-hidden="true" />
                  </button>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.id}\0${row.sessionId}\0${row.timestamp}`}>
              <TableCell className="whitespace-nowrap">
                {format.dateTime(row.timestamp, true)}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{row.provider}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.model}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {format.compact(row.inputTokens)} /{" "}
                {row.outputTokens === null
                  ? "—"
                  : format.compact(row.outputTokens)}
                <div className="text-xs text-muted-foreground">
                  {format.compact(row.totalTokens)}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {format.compact(row.cacheReadTokens)} /{" "}
                {row.cacheWriteTokens === null
                  ? "—"
                  : format.compact(row.cacheWriteTokens)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <RequestStatusDot isError={row.isError} />
                  {row.requestCount > 1 ? (
                    <Badge
                      variant="outline"
                      title={t.requestAggregate(row.requestCount)}
                    >
                      ×{format.number(row.requestCount)}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {format.duration(row.durationMs)}
              </TableCell>
              <TableCell className="text-right font-mono font-medium tabular-nums">
                {format.currency(row.cost)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        page={page}
        pageCount={pageCount}
        onPageChange={onPageChange}
        disabled={isLoading}
        labels={{
          navigation: t.pagination,
          previous: t.previousPage,
          next: t.nextPage,
          page: t.pageStatus,
        }}
      />
    </>
  )
}

export function RequestsPage({
  data,
  requestPage,
  isLoading,
  onPageChange,
  onSortChange,
  onRangeChange,
}: {
  data: RequestsResponse | null
  requestPage: RequestPageOptions
  isLoading: boolean
  onPageChange: (page: number) => void
  onSortChange: (sort: RequestSortKey, direction: SortDirection) => void
  onRangeChange: (from: string, to: string) => void
}) {
  const { messages: t } = useI18n()

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm" className="bg-card/90 backdrop-blur">
        <CardHeader>
          <h2 className="text-sm font-medium">{t.dateRange}</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <RequestRangePicker
            from={requestPage.from}
            to={requestPage.to}
            onRangeChange={onRangeChange}
          />
          {data ? <RequestTotals totals={data.totals} /> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium">{t.requestLog}</h2>
          <p className="text-sm text-muted-foreground">
            {t.requestLogDetails}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data ? (
            <RequestsTable
              rows={data.rows}
              total={data.total}
              page={data.page}
              pageSize={data.pageSize}
              sort={requestPage.sort}
              direction={requestPage.direction}
              isLoading={isLoading}
              onPageChange={onPageChange}
              onSortChange={onSortChange}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
import type {
  RequestPageOptions,
  RequestSortKey,
  SessionPageOptions,
  SessionSortKey,
  SortDirection,
  StatsFilters,
  StatsRange,
} from "@/types"

export const dashboardPaths = {
  overview: "/",
  costs: "/costs",
  sessions: "/sessions",
  models: "/models",
  tools: "/tools",
  skills: "/skills",
  requests: "/requests",
} as const

export type DashboardPageId = keyof typeof dashboardPaths

export interface SessionTraceSelection {
  id: string
  project: string
}

export const dashboardPages = Object.entries(dashboardPaths).map(
  ([id, path]) => ({ id, path })
) as Array<{
  id: DashboardPageId
  path: (typeof dashboardPaths)[DashboardPageId]
}>

export function dashboardSearchForPage(
  search: string | URLSearchParams,
  page: DashboardPageId
) {
  const next = new URLSearchParams(search)
  if (page !== "sessions" && page !== "requests") {
    next.delete("page")
    next.delete("pageSize")
    next.delete("sort")
    next.delete("direction")
    next.delete("sessionId")
    next.delete("sessionProject")
  }
  if (page !== "requests") {
    next.delete("from")
    next.delete("to")
  }
  const value = next.toString()
  return value ? `?${value}` : ""
}

export function dashboardPageFromPath(pathname: string) {
  return (
    dashboardPages.find(({ path }) =>
      path === "/"
        ? pathname === path
        : pathname === path || pathname === `${path}/`
    ) ?? null
  )
}

export const INITIAL_FILTERS: StatsFilters = {
  range: "all",
  project: "",
  provider: "",
  model: "",
}

export const INITIAL_SESSION_PAGE: SessionPageOptions = {
  page: 1,
  pageSize: 20,
  sort: "startedAt",
  direction: "desc",
}

const isoDay = /^\d{4}-\d{2}-\d{2}$/

export function todayString(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** Rejects malformed and overflowing days such as 2026-02-30. */
function isLocalDay(value: string): boolean {
  if (!isoDay.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const parsed = new Date(year!, month! - 1, day!)
  return !Number.isNaN(parsed.getTime()) && todayString(parsed) === value
}

export function INITIAL_REQUEST_PAGE(): RequestPageOptions {
  const today = todayString()
  return {
    from: today,
    to: today,
    page: 1,
    pageSize: 20,
    sort: "timestamp",
    direction: "desc",
  }
}

const ranges = new Set<StatsRange>(["today", "7d", "30d", "90d", "all"])
const requestSorts = new Set<RequestSortKey>([
  "timestamp",
  "duration",
  "totalTokens",
  "cost",
  "cacheReadTokens",
])
const sessionSorts = new Set<SessionSortKey>([
  "name",
  "startedAt",
  "project",
  "models",
  "requests",
  "tokens",
  "cost",
])
const directions = new Set<SortDirection>(["asc", "desc"])

export function statsRequestSearch(filters: StatsFilters) {
  const search = new URLSearchParams({ range: filters.range })
  if (filters.project) search.set("project", filters.project)
  if (filters.provider) search.set("provider", filters.provider)
  if (filters.model) search.set("model", filters.model)
  return search
}

export function sessionsRequestSearch(
  filters: StatsFilters,
  sessionPage: SessionPageOptions
) {
  const search = statsRequestSearch(filters)
  search.set("page", String(sessionPage.page))
  search.set("pageSize", String(sessionPage.pageSize))
  search.set("sort", sessionPage.sort)
  search.set("direction", sessionPage.direction)
  return search
}

export function filtersFromSearch(search: URLSearchParams): StatsFilters {
  const range = search.get("range") as StatsRange | null
  return {
    range: range && ranges.has(range) ? range : INITIAL_FILTERS.range,
    project: search.get("project") ?? "",
    provider: search.get("provider") ?? "",
    model: search.get("model") ?? "",
  }
}

export function sessionTraceFromSearch(
  search: URLSearchParams
): SessionTraceSelection | null {
  const id = search.get("sessionId")
  const project = search.get("sessionProject")
  return id && project !== null ? { id, project } : null
}

export function sessionPageFromSearch(
  search: URLSearchParams
): SessionPageOptions {
  const page = Number(search.get("page"))
  const sort = search.get("sort") as SessionSortKey | null
  const direction = search.get("direction") as SortDirection | null
  return {
    ...INITIAL_SESSION_PAGE,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    sort: sort && sessionSorts.has(sort) ? sort : INITIAL_SESSION_PAGE.sort,
    direction:
      direction && directions.has(direction)
        ? direction
        : INITIAL_SESSION_PAGE.direction,
  }
}

export function requestsRequestSearch(
  filters: StatsFilters,
  requestPage: RequestPageOptions
) {
  const search = statsRequestSearch(filters)
  search.set("from", requestPage.from)
  search.set("to", requestPage.to)
  search.set("page", String(requestPage.page))
  search.set("sort", requestPage.sort)
  search.set("direction", requestPage.direction)
  return search
}

export function requestPageFromSearch(
  search: URLSearchParams
): RequestPageOptions {
  const defaults = INITIAL_REQUEST_PAGE()
  const from = search.get("from")
  const to = search.get("to")
  const page = Number(search.get("page"))
  const sort = search.get("sort") as RequestSortKey | null
  const direction = search.get("direction") as SortDirection | null
  const first = from && isLocalDay(from) ? from : defaults.from
  const second = to && isLocalDay(to) ? to : defaults.to
  return {
    from: first < second ? first : second,
    to: first < second ? second : first,
    pageSize: 20,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    sort: sort && requestSorts.has(sort) ? sort : defaults.sort,
    direction:
      direction && directions.has(direction) ? direction : defaults.direction,
  }
}

export function withRequestPage(
  search: URLSearchParams,
  updates: Partial<
    Pick<
      RequestPageOptions,
      "page" | "sort" | "direction" | "from" | "to"
    >
  >
): URLSearchParams {
  const next = new URLSearchParams(search)
  const current = requestPageFromSearch(next)
  const page = updates.page ?? current.page
  const sort = updates.sort ?? current.sort
  const direction = updates.direction ?? current.direction
  const first = updates.from ?? current.from
  const second = updates.to ?? current.to

  next.set("from", first < second ? first : second)
  next.set("to", first < second ? second : first)
  if (page === 1) next.delete("page")
  else next.set("page", String(page))
  if (sort === "timestamp") next.delete("sort")
  else next.set("sort", sort)
  if (direction === "desc") next.delete("direction")
  else next.set("direction", direction)
  return next
}

export function withFilter(
  search: URLSearchParams,
  key: keyof StatsFilters,
  value: string
): URLSearchParams {
  const next = new URLSearchParams(search)
  next.delete("page")
  next.delete("sessionId")
  next.delete("sessionProject")
  if (!value || (key === "range" && value === INITIAL_FILTERS.range))
    next.delete(key)
  else next.set(key, value)
  return next
}

export function withSessionTrace(
  search: URLSearchParams,
  selection: SessionTraceSelection | null
): URLSearchParams {
  const next = new URLSearchParams(search)
  if (selection) {
    next.set("sessionId", selection.id)
    next.set("sessionProject", selection.project)
  } else {
    next.delete("sessionId")
    next.delete("sessionProject")
  }
  return next
}

export function withSessionPage(
  search: URLSearchParams,
  updates: Partial<Pick<SessionPageOptions, "page" | "sort" | "direction">>
): URLSearchParams {
  const next = new URLSearchParams(search)
  const current = sessionPageFromSearch(next)
  const page = updates.page ?? current.page
  const sort = updates.sort ?? current.sort
  const direction = updates.direction ?? current.direction

  if (page === INITIAL_SESSION_PAGE.page) next.delete("page")
  else next.set("page", String(page))
  if (sort === INITIAL_SESSION_PAGE.sort) next.delete("sort")
  else next.set("sort", sort)
  if (direction === INITIAL_SESSION_PAGE.direction) next.delete("direction")
  else next.set("direction", direction)
  return next
}

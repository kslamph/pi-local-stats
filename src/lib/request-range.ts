export interface RequestRangePreset {
  id: "today" | "7d" | "30d"
  label: string
  from: string
  to: string
}

export function shiftDays(day: string, offset: number): string {
  const [year, month, date] = day.split("-").map(Number)
  const shifted = new Date(year!, month! - 1, date! + offset)
  const paddedMonth = String(shifted.getMonth() + 1).padStart(2, "0")
  const paddedDay = String(shifted.getDate()).padStart(2, "0")
  return `${shifted.getFullYear()}-${paddedMonth}-${paddedDay}`
}

/** Preset ranges end today and count it as the first day of the window. */
export function requestRangePresets(
  today: string,
  labels: { today: string; last7Days: string; last30Days: string }
): RequestRangePreset[] {
  return [
    { id: "today", label: labels.today, from: today, to: today },
    {
      id: "7d",
      label: labels.last7Days,
      from: shiftDays(today, -6),
      to: today,
    },
    {
      id: "30d",
      label: labels.last30Days,
      from: shiftDays(today, -29),
      to: today,
    },
  ]
}
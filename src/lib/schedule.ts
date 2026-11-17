import type { DatePreference, DayPart, TimePreference } from "../types"

/** The prototype runs on a fixed "today" so every result is repeatable. */
export const TODAY = "2026-11-10"

export const DAY_PART_HOURS: Record<DayPart, [number, number]> = {
  morning: [9, 12],
  afternoon: [12, 17],
  evening: [17, 21],
}

export function fromIso(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function addDays(iso: string, days: number) {
  const date = fromIso(iso)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

export function weekdayName(iso: string) {
  return fromIso(iso).toLocaleDateString("en-US", { weekday: "long" })
}

/** "Saturday, November 14" */
export function longDate(iso: string) {
  return fromIso(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/** "Sat, Nov 14" */
export function shortDateIso(iso: string) {
  return fromIso(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

/** "Sunday, Nov 15" */
export function mediumDate(iso: string) {
  return fromIso(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

export function isoFromLongDate(label: string) {
  // Only "Saturday, November 14". The browser would guess at anything else.
  if (!/^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}$/.test(label)) return null
  const parsed = new Date(`${label.split(", ")[1]}, 2026`)
  return Number.isNaN(parsed.getTime()) ? null : toIso(parsed)
}

/** Monday-based offset, so a week runs Monday to Sunday. */
function mondayOffset(iso: string) {
  return (fromIso(iso).getDay() + 6) % 7
}

export function weekStart(iso: string) {
  return addDays(iso, -mondayOffset(iso))
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

/**
 * "this" is the occurrence in the current week, "next" is the one in the
 * following week. A bare weekday is its next occurrence after today.
 */
export function resolveWeekday(name: string, modifier: "this" | "next" | null, today = TODAY) {
  const index = WEEKDAYS.indexOf(name)
  const inThisWeek = addDays(weekStart(today), index)
  if (modifier === "next") return addDays(inThisWeek, 7)
  if (modifier === "this") return inThisWeek < today ? addDays(inThisWeek, 7) : inThisWeek
  return inThisWeek <= today ? addDays(inThisWeek, 7) : inThisWeek
}

export function formatHour(hour: number) {
  const whole = Math.floor(hour)
  const minutes = Math.round((hour - whole) * 60)
  return `${whole % 12 || 12}:${String(minutes).padStart(2, "0")} ${whole >= 12 ? "PM" : "AM"}`
}

export function capitalize(text: string) {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

function rangeLabel(start: string, end: string) {
  const from = fromIso(start)
  const to = fromIso(end)
  const month = (date: Date) => date.toLocaleDateString("en-US", { month: "short" })
  return month(from) === month(to)
    ? `${month(from)} ${from.getDate()}–${to.getDate()}`
    : `${month(from)} ${from.getDate()}–${month(to)} ${to.getDate()}`
}

export type DateDisplay = { primary: string; secondary: string; label: string }

export function describeDate(date?: DatePreference): DateDisplay {
  if (!date) return { primary: "Choose", secondary: "Not set yet", label: "" }
  if (date.kind === "specific") {
    const value = fromIso(date.date)
    return {
      primary: value.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      secondary: weekdayName(date.date),
      label: longDate(date.date),
    }
  }
  if (date.kind === "deadline") {
    const value = fromIso(date.date)
    return {
      primary: `By ${value.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      secondary: weekdayName(date.date),
      label: `By ${longDate(date.date)}`,
    }
  }
  if (date.kind === "flexible") {
    return { primary: "Flexible", secondary: "Any day", label: "Flexible" }
  }
  return date.flexible
    ? { primary: "Flexible", secondary: date.label, label: `Flexible · ${date.label}` }
    : {
        primary: date.label,
        secondary: rangeLabel(date.start, date.end),
        label: `${date.label} · ${rangeLabel(date.start, date.end)}`,
      }
}

export type TimeDisplay = { primary: string; secondary: string; label: string }

export function describeTime(time?: TimePreference): TimeDisplay {
  const helper = "Helper confirms a time"
  if (!time) return { primary: "Choose", secondary: "Not set yet", label: "" }
  if (time.kind === "flexible") return { primary: "Flexible", secondary: helper, label: "Flexible" }
  if (time.kind === "part") {
    const name = capitalize(time.part)
    return { primary: name, secondary: helper, label: name }
  }
  if (time.kind === "before-part") {
    const name = `Before ${time.part}`
    return { primary: name, secondary: helper, label: name }
  }
  if (time.kind === "before") {
    const name = `Before ${formatHour(time.hour)}`
    return { primary: name, secondary: helper, label: name }
  }
  if (time.kind === "after") {
    const name = `After ${formatHour(time.hour)}`
    return { primary: name, secondary: helper, label: name }
  }
  const name = formatHour(time.hour)
  return { primary: name, secondary: "", label: name }
}

/** Every date the preference allows, earliest first. */
export function candidateDates(date: DatePreference | undefined) {
  if (!date) return dateRange(addDays(TODAY, 1), addDays(TODAY, 7))
  if (date.kind === "specific") return [date.date]
  if (date.kind === "deadline") return dateRange(TODAY, date.date)
  return dateRange(date.start < TODAY ? TODAY : date.start, date.end)
}

function dateRange(start: string, end: string) {
  const dates: string[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day)
  return dates
}

/** The last date of the allowed window, used for sorting bookings. */
export function windowEnd(date: DatePreference) {
  if (date.kind === "specific" || date.kind === "deadline") return date.date
  return date.end
}

/**
 * The earliest start inside a helper's working hours that meets the time
 * preference, or null when the job cannot fit.
 */
export function earliestStart(
  time: TimePreference | undefined,
  hours: number,
  open: number,
  close: number,
) {
  const fits = (start: number, latestEnd = close) =>
    start >= open && start + hours <= Math.min(close, latestEnd) ? start : null
  if (!time || time.kind === "flexible") return fits(open)
  if (time.kind === "exact") return fits(time.hour)
  if (time.kind === "before") return fits(open, time.hour)
  if (time.kind === "after") return fits(Math.max(open, time.hour))
  const [from, to] = DAY_PART_HOURS[time.part]
  if (time.kind === "before-part") return fits(open, from)
  const start = Math.max(open, from)
  return start < to ? fits(start) : null
}

export function samePreference(
  a: { date?: DatePreference; time?: TimePreference },
  b: { date?: DatePreference; time?: TimePreference },
) {
  return JSON.stringify([a.date, a.time]) === JSON.stringify([b.date, b.time])
}

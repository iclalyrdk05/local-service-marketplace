import { providerById, providers, workingHoursOn, type Provider } from "../data/helpers"
import { serviceCatalog } from "../data/serviceCatalog"
import type {
  DatePreference,
  GeneratedPlan,
  PlanAssignment,
  PlanAvailability,
  PlanId,
  PlanPart,
  ServiceRequest,
  ServiceTask,
  TaskCategory,
  TimePreference,
} from "../types"
import { priceAssignments, priceDifference } from "./pricing"
import { addDays, candidateDates, describeDate, earliestStart, mediumDate, samePreference, windowEnd } from "./schedule"

const MAX_SOLO_HOURS = 8
const MAX_TWO_VISIT_HOURS = 16
const HANDOFF_HOURS = 0.5
// Shareable work (cleaning, organizing) is worth splitting from this size up.
const MIN_SHARE_HOURS = 2
// A crew of three only helps on bigger shareable jobs.
const MIN_CREW_HOURS = 3
const CREW_SIZE = 3
const LATER_SEARCH_DAYS = 21

export type PlanOverrides = Partial<Record<PlanId, string[]>>

export type GenerateOptions = {
  overrides?: PlanOverrides
  savedHelpers?: string[]
}

type Schedule = { date?: DatePreference; time?: TimePreference }

export function areaFromAddress(address?: string) {
  return /brooklyn/i.test(address ?? "") ? "Brooklyn" : "Manhattan"
}

function helperCan(helper: Provider, categories: TaskCategory[]) {
  return categories.every((category) => (helper.capabilities[category] ?? 0) > 0)
}

function canWork(helper: Provider, iso: string, time: TimePreference | undefined, hours: number) {
  const open = workingHoursOn(helper, iso)
  return open ? earliestStart(time, hours, open[0], open[1]) !== null : false
}

function timeForDate(schedule: Schedule, iso: string) {
  // Before a deadline day, any time works. The limit applies on the last day.
  if (schedule.date?.kind === "deadline" && iso < schedule.date.date) return undefined
  return schedule.time
}

function firstOpenDate(helper: Provider, schedule: Schedule, hours: number) {
  return candidateDates(schedule.date).find((iso) => canWork(helper, iso, timeForDate(schedule, iso), hours))
}

export function scoreHelper(
  helper: Provider,
  categories: TaskCategory[],
  schedule: Schedule,
  hours: number,
  request: ServiceRequest,
  saved: string[] = [],
) {
  const skill = categories.reduce((sum, category) => sum + (helper.capabilities[category] ?? 0), 0) / categories.length
  const available = firstOpenDate(helper, schedule, hours) ? 15 : 0
  const preferred = request.selectedHelpers?.includes(helper.id) ? 8 : 0
  const savedBonus = saved.includes(helper.id) ? 2 : 0
  const rate = Number(helper.rate.replace(/[^\d.]/g, ""))
  return skill * 50 + Number(helper.rating) * 4 + available + preferred + savedBonus - rate * 0.1
}

function eligibleHelpers(request: ServiceRequest, categories: TaskCategory[]) {
  const area = areaFromAddress(request.location)
  return providers.filter((helper) => helper.serviceAreas.includes(area) && helperCan(helper, categories))
}

function bestHelper(
  request: ServiceRequest,
  categories: TaskCategory[],
  schedule: Schedule,
  hours: number,
  saved: string[],
  exclude: string[] = [],
) {
  return eligibleHelpers(request, categories)
    .filter((helper) => !exclude.includes(helper.id))
    .map((helper) => ({ helper, score: scoreHelper(helper, categories, schedule, hours, request, saved) }))
    .sort((a, b) => b.score - a.score)[0]
}

function requestSchedule(request: ServiceRequest): Schedule {
  return { date: request.datePreference, time: request.timePreference }
}

function isCompatible(task: ServiceTask, base: Schedule) {
  // A flexible override can simply happen during the main visit.
  const flexibleDate = !task.datePreference || task.datePreference.kind === "flexible" || (task.datePreference.kind === "window" && task.datePreference.flexible)
  const flexibleTime = !task.timePreference || task.timePreference.kind === "flexible"
  if (flexibleDate && flexibleTime) return true
  return samePreference({ date: task.datePreference, time: task.timePreference }, base)
}

function partsFor(tasks: ServiceTask[], base: Schedule): PlanPart[] {
  const main = tasks.filter((task) => isCompatible(task, base))
  const parts: PlanPart[] = []
  if (main.length) {
    parts.push({
      taskIds: main.map((task) => task.id),
      hours: main.reduce((sum, task) => sum + task.estimatedDuration, 0),
      primary: true,
    })
  }
  for (const task of tasks.filter((item) => !main.includes(item))) {
    parts.push({
      taskIds: [task.id],
      hours: task.estimatedDuration,
      primary: false,
      date: task.datePreference ?? base.date,
      time: task.timePreference ?? base.time,
    })
  }
  return parts
}

function roleFor(tasks: ServiceTask[]) {
  const labels = [...new Set(tasks.map((task) => serviceCatalog[task.category].roleLabel))]
  return labels.length > 2 ? "All tasks" : labels.join(" and ")
}

function assign(helperId: string, tasks: ServiceTask[], base: Schedule, extraHours = 0): PlanAssignment {
  const parts = partsFor(tasks, base)
  const primary = parts.find((part) => part.primary)
  if (primary && extraHours) primary.hours += extraHours
  return {
    helperId,
    role: roleFor(tasks),
    taskIds: tasks.map((task) => task.id),
    hours: parts.reduce((sum, part) => sum + part.hours, 0),
    parts,
  }
}

type Draft = {
  id: PlanId
  title: string
  description: string
  assignments: PlanAssignment[]
  concurrent: boolean
  visits?: number
}

function categoriesOf(tasks: ServiceTask[]) {
  return [...new Set(tasks.map((task) => task.category))]
}

function needsSeparateVisit(tasks: ServiceTask[]) {
  const away = tasks.some((task) => !serviceCatalog[task.category].sameVisit)
  return away && tasks.some((task) => serviceCatalog[task.category].sameVisit)
}

function soloDraft(request: ServiceRequest, saved: string[]): Draft | null {
  const { tasks } = request
  const hours = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0)
  const schedule = requestSchedule(request)
  // A long job only works for one person if the dates allow two visits.
  const visits = hours > MAX_SOLO_HOURS ? 2 : 1
  if (hours > MAX_TWO_VISIT_HOURS || (visits > 1 && candidateDates(schedule.date).length < 2)) return null
  const categories = categoriesOf(tasks)
  const best = bestHelper(request, categories, schedule, hours / visits, saved)
  if (!best) return null
  return {
    id: "solo",
    title: "One helper",
    description:
      visits > 1
        ? "One helper covers everything across two visits."
        : tasks.length > 1
          ? "One helper handles everything in a single visit."
          : "One helper who is right for this job.",
    assignments: [assign(best.helper.id, tasks, schedule)],
    concurrent: true,
    visits,
  }
}

function partitions<T>(items: T[]) {
  const result: Array<[T[], T[]]> = []
  const total = 1 << items.length
  for (let mask = 1; mask < total - 1; mask += 1) {
    if (!(mask & 1)) continue
    const left = items.filter((_, index) => mask & (1 << index))
    const right = items.filter((_, index) => !(mask & (1 << index)))
    result.push([left, right])
  }
  return result
}

function teamDraft(request: ServiceRequest, saved: string[]): Draft | null {
  const { tasks } = request
  const schedule = requestSchedule(request)
  if (tasks.length === 1) {
    const [task] = tasks
    if (!serviceCatalog[task.category].canShare || task.estimatedDuration < MIN_SHARE_HOURS) return null
    const share = task.estimatedDuration / 2 + HANDOFF_HOURS
    const first = bestHelper(request, [task.category], schedule, share, saved)
    const second = first && bestHelper(request, [task.category], schedule, share, saved, [first.helper.id])
    if (!first || !second) return null
    const makeShare = (helperId: string): PlanAssignment => ({
      helperId,
      role: serviceCatalog[task.category].roleLabel,
      taskIds: [task.id],
      hours: share,
      parts: [{ taskIds: [task.id], hours: share, primary: true }],
    })
    return {
      id: "team",
      title: "Two helpers",
      description: "Two helpers share the work and finish sooner.",
      assignments: [makeShare(first.helper.id), makeShare(second.helper.id)],
      concurrent: true,
    }
  }
  let best: { draft: Draft; elapsed: number; score: number } | null = null
  for (const [left, right] of partitions(tasks)) {
    const hoursOf = (group: ServiceTask[]) => group.reduce((sum, task) => sum + task.estimatedDuration, 0)
    const a = bestHelper(request, categoriesOf(left), schedule, hoursOf(left), saved)
    if (!a) continue
    const b = bestHelper(request, categoriesOf(right), schedule, hoursOf(right), saved, [a.helper.id])
    if (!b) continue
    const separate = needsSeparateVisit(left) || needsSeparateVisit(right)
    if (separate) continue
    const apart = needsSeparateVisit(tasks)
    const handoff = !apart && (left.length > 1 || right.length > 1) ? HANDOFF_HOURS : 0
    const elapsed = Math.max(hoursOf(left), hoursOf(right)) + handoff
    const score = a.score + b.score - elapsed * 6
    if (!best || score > best.score) {
      best = {
        elapsed,
        score,
        draft: {
          id: "team",
          title: "Two helpers",
          description: apart
            ? "Each helper handles their own part in a separate appointment."
            : "Two helpers work at the same time and finish sooner.",
          assignments: [
            assign(a.helper.id, left, schedule, left.length > 1 ? handoff : 0),
            assign(b.helper.id, right, schedule, right.length > 1 ? handoff : 0),
          ],
          concurrent: !apart,
        },
      }
    }
  }
  return best?.draft ?? null
}

function specialistsDraft(request: ServiceRequest, saved: string[]): Draft | null {
  const { tasks } = request
  const schedule = requestSchedule(request)
  const categories = categoriesOf(tasks)
  if (categories.length === 1) return crewDraft(request, saved)
  if (categories.length === 2) return sharedTrioDraft(request, saved)
  const groups: TaskCategory[][] = []
  const remaining = [...categories]
  // Laundry and cleaning are usually the same person's work.
  if (categories.length > 3 && remaining.includes("cleaning") && remaining.includes("laundry")) {
    groups.push(["cleaning", "laundry"])
    remaining.splice(remaining.indexOf("cleaning"), 1)
    remaining.splice(remaining.indexOf("laundry"), 1)
  }
  remaining.forEach((category) => groups.push([category]))
  if (groups.length !== 3) return null
  const used: string[] = []
  const assignments: PlanAssignment[] = []
  for (const group of groups) {
    const groupTasks = tasks.filter((task) => group.includes(task.category))
    const hours = groupTasks.reduce((sum, task) => sum + task.estimatedDuration, 0)
    const best = bestHelper(request, group, schedule, hours, saved, used)
    if (!best) return null
    used.push(best.helper.id)
    assignments.push(assign(best.helper.id, groupTasks, schedule))
  }
  const apart = needsSeparateVisit(tasks)
  return {
    id: "split",
    title: "Multiple helpers",
    description: "A specialist for each kind of work, all at once.",
    assignments,
    concurrent: !apart,
  }
}

/** Two kinds of work: two people share the larger one, a third does the rest. */
function sharedTrioDraft(request: ServiceRequest, saved: string[]): Draft | null {
  const { tasks } = request
  const schedule = requestSchedule(request)
  const lead = sharableTask(tasks)
  if (!lead) return null
  const shared = tasks.filter((task) => task.category === lead.category)
  const rest = tasks.filter((task) => task.category !== lead.category)
  const sharedHours = shared.reduce((sum, task) => sum + task.estimatedDuration, 0)
  const restHours = rest.reduce((sum, task) => sum + task.estimatedDuration, 0)
  const share = sharedHours / 2 + HANDOFF_HOURS
  const first = bestHelper(request, [lead.category], schedule, share, saved)
  const second = first && bestHelper(request, [lead.category], schedule, share, saved, [first.helper.id])
  const third =
    first && second && bestHelper(request, categoriesOf(rest), schedule, restHours, saved, [first.helper.id, second.helper.id])
  if (!first || !second || !third) return null
  const role = serviceCatalog[lead.category].roleLabel
  const ids = shared.map((task) => task.id)
  const makeShare = (helperId: string): PlanAssignment => ({
    helperId,
    role,
    taskIds: ids,
    hours: share,
    parts: [{ taskIds: ids, hours: share, primary: true }],
  })
  return {
    id: "split",
    title: "Multiple helpers",
    description: `Helpers share the ${role.toLowerCase()} while another does the rest.`,
    assignments: [makeShare(first.helper.id), makeShare(second.helper.id), assign(third.helper.id, rest, schedule)],
    concurrent: !needsSeparateVisit(tasks),
  }
}

/** One kind of shareable work: a small crew splits it and finishes fastest. */
function crewDraft(request: ServiceRequest, saved: string[]): Draft | null {
  const { tasks } = request
  const [category] = categoriesOf(tasks)
  const hours = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0)
  if (!crewFits(tasks)) return null
  const schedule = requestSchedule(request)
  // Round up to the next quarter hour so the card shows a clean duration.
  const share = Math.ceil((hours / CREW_SIZE + HANDOFF_HOURS) * 4) / 4
  const used: string[] = []
  for (let index = 0; index < CREW_SIZE; index += 1) {
    const next = bestHelper(request, [category], schedule, share, saved, used)
    if (!next) return null
    used.push(next.helper.id)
  }
  const ids = tasks.map((task) => task.id)
  const role = serviceCatalog[category].roleLabel
  return {
    id: "split",
    title: "Multiple helpers",
    description: "A small crew shares the work and finishes fastest.",
    assignments: used.map((helperId) => ({
      helperId,
      role,
      taskIds: ids,
      hours: share,
      parts: [{ taskIds: ids, hours: share, primary: true }],
    })),
    concurrent: true,
  }
}

function crewFits(tasks: ServiceTask[]) {
  const categories = categoriesOf(tasks)
  const hours = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0)
  return categories.length === 1 && serviceCatalog[categories[0]].canShare && hours >= MIN_CREW_HOURS
}

function sharableTask(tasks: ServiceTask[]) {
  return [...tasks]
    .filter((task) => serviceCatalog[task.category].canShare && task.estimatedDuration >= MIN_SHARE_HOURS)
    .sort((a, b) => b.estimatedDuration - a.estimatedDuration)[0]
}

export type PackageGap = { id: PlanId; title: string; reason: string }

/** Why a package could not be put together, so the screen can still show it. */
export function packageGaps(request: ServiceRequest, plans: GeneratedPlan[]): PackageGap[] {
  if (request.tasks.length === 0) return []
  const { tasks } = request
  const schedule = requestSchedule(request)
  const day = request.datePreference?.kind === "specific" ? ` on ${weekdayOf(request.datePreference.date)}` : ""
  const hours = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0)
  const categories = categoriesOf(tasks)
  const gaps: PackageGap[] = []
  const slower = slowerPackages(request)
  if (!plans.some((plan) => plan.id === "solo")) {
    const tooLong = hours > MAX_TWO_VISIT_HOURS || (hours > MAX_SOLO_HOURS && candidateDates(schedule.date).length < 2)
    gaps.push({
      id: "solo",
      title: "One helper",
      reason: tooLong
        ? `About ${Math.round(hours)} hours of work is too much for one person${day}.`
        : `We couldn’t find one helper available to do all of these tasks${day}.`,
    })
  }
  if (!plans.some((plan) => plan.id === "team")) {
    const small =
      tasks.length === 1 && (!serviceCatalog[tasks[0].category].canShare || tasks[0].estimatedDuration < MIN_SHARE_HOURS)
    gaps.push({
      id: "team",
      title: "Two helpers",
      reason: small
        ? "This job is small enough for one person, so a second helper wouldn’t speed it up."
        : slower.includes("team")
          ? "A second helper wouldn’t finish this any sooner than one."
          : `We couldn’t find two helpers available${day}.`,
    })
  }
  if (!plans.some((plan) => plan.id === "split")) {
    const notNeeded =
      (categories.length === 1 && !crewFits(tasks)) || (categories.length === 2 && !sharableTask(tasks))
    gaps.push({
      id: "split",
      title: "Multiple helpers",
      reason: notNeeded
        ? "This job is too small to split between more helpers."
        : slower.includes("split")
          ? "More helpers wouldn’t finish this any sooner than two."
          : `We couldn’t find enough helpers available${day}.`,
    })
  }
  return gaps
}

function weekdayOf(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long" })
}

function applyOverrides(draft: Draft, overrides: PlanOverrides | undefined, tasks: ServiceTask[]) {
  const team = overrides?.[draft.id]
  if (!team || team.length !== draft.assignments.length) return draft
  return {
    ...draft,
    assignments: draft.assignments.map((assignment, index) => {
      const helper = providerById(team[index])
      const categories = categoriesOf(tasks.filter((task) => assignment.taskIds.includes(task.id)))
      return helper && helperCan(helper, categories) ? { ...assignment, helperId: helper.id } : assignment
    }),
  }
}

function primaryLoads(assignments: PlanAssignment[], visits = 1) {
  return assignments.flatMap((assignment) =>
    assignment.parts
      .filter((part) => part.primary)
      .map((part) => ({ helper: providerById(assignment.helperId)!, hours: part.hours / visits })),
  )
}

function dateFitsAll(loads: Array<{ helper: Provider; hours: number }>, schedule: Schedule, iso: string) {
  return loads.every(({ helper, hours }) => canWork(helper, iso, timeForDate(schedule, iso), hours))
}

/** Together: one shared day. Separate: each helper needs a day in the window. */
function checkAvailability(draft: Draft, schedule: Schedule): PlanAvailability {
  const visits = draft.visits ?? 1
  const loads = primaryLoads(draft.assignments, visits)
  const dates = candidateDates(schedule.date)
  const separateParts = draft.assignments.flatMap((assignment) =>
    assignment.parts
      .filter((part) => !part.primary)
      .map((part) => ({ helper: providerById(assignment.helperId)!, part })),
  )
  const extrasFit = separateParts.every(({ helper, part }) =>
    Boolean(firstOpenDate(helper, { date: part.date, time: part.time }, part.hours)),
  )
  const openDays = dates.filter((iso) => dateFitsAll(loads, schedule, iso))
  const sharedDay = draft.concurrent
    ? openDays.length >= visits
      ? openDays[0]
      : undefined
    : loads.every(({ helper, hours }) => firstOpenDate(helper, schedule, hours))
      ? dates[0]
      : undefined
  if (sharedDay && extrasFit) return { status: "fits", date: sharedDay }

  const blocked =
    loads.find(({ helper, hours }) => !firstOpenDate(helper, schedule, hours))?.helper ??
    separateParts.find(({ helper, part }) => !firstOpenDate(helper, { date: part.date, time: part.time }, part.hours))?.helper ??
    loads[0]?.helper
  const lastAllowed = schedule.date ? windowEnd(schedule.date) : addDays(dates[dates.length - 1], 0)
  const laterSchedule: Schedule = {
    time: schedule.date?.kind === "deadline" ? undefined : schedule.time,
  }
  let nextDate: string | null = null
  // Moving the main visit cannot fix a separate appointment that is blocked.
  const mainBlocked = !sharedDay && visits === 1
  for (let offset = 1; mainBlocked && offset <= LATER_SEARCH_DAYS && !nextDate; offset += 1) {
    const iso = addDays(lastAllowed, offset)
    if (dateFitsAll(loads, laterSchedule, iso)) nextDate = iso
  }
  return {
    status: "later",
    helperId: blocked?.id ?? "",
    nextDate,
    blockedLabel: blockedLabel(schedule.date),
  }
}

export function blockedLabel(date?: DatePreference) {
  if (!date) return "soon"
  if (date.kind === "specific") return describeDate(date).secondary
  if (date.kind === "deadline") return `by ${describeDate(date).secondary}`
  if (date.kind === "flexible") return "soon"
  return date.label.toLowerCase()
}

function elapsedHours(draft: Draft) {
  // Helpers work at the same time, or in their own separate appointments,
  // so the job takes as long as the longest share.
  return Math.max(...draft.assignments.map((item) => item.hours))
}

/** Bigger packages that would not finish any sooner than a smaller one. */
function slowerPackages(request: ServiceRequest, drafts?: Draft[]): PlanId[] {
  const saved: string[] = []
  const list =
    drafts ??
    [soloDraft(request, saved), teamDraft(request, saved), specialistsDraft(request, saved)].filter(
      (draft): draft is Draft => draft !== null,
    )
  const hoursOf = (id: PlanId) => {
    const draft = list.find((item) => item.id === id)
    return draft ? elapsedHours(draft) : null
  }
  const solo = hoursOf("solo")
  const team = hoursOf("team")
  const split = hoursOf("split")
  const slower: PlanId[] = []
  if (team !== null && solo !== null && team >= solo) slower.push("team")
  const smaller = [solo, slower.includes("team") ? null : team].filter((value): value is number => value !== null)
  if (split !== null && smaller.some((value) => split >= value)) slower.push("split")
  return slower
}

function scorePlan(
  plan: Omit<GeneratedPlan, "score" | "isBest" | "isFastest" | "tradeoff" | "tradeoffParts">,
) {
  const rating =
    plan.helperIds.reduce((sum, id) => sum + Number(providerById(id)?.rating ?? 4.5), 0) / plan.helperIds.length
  return (
    (plan.availability.status === "fits" ? 100 : 0) -
    plan.price.total / 20 +
    rating * 2 +
    // Each extra person is more to coordinate in the home.
    (plan.helperIds.length - 1) * -2 -
    // A second trip is more to arrange than one visit.
    (plan.visits - 1) * 6
  )
}

function describeTradeoff(plan: GeneratedPlan, best: GeneratedPlan) {
  const notes: string[] = []
  if (plan.availability.status === "later" && plan.availability.nextDate) {
    notes.push(`Available ${mediumDate(plan.availability.nextDate)}`)
  }
  if (plan.visits > 1) notes.push(`${plan.visits} visits`)
  if (plan.availability.status === "fits") {
    if (plan.hours < best.hours) notes.push("Finishes sooner")
    else if (plan.hours > best.hours) notes.push("Takes longer")
    else if (best.availability.status === "fits" && plan.availability.date === best.availability.date) {
      notes.push("Same day")
    }
  }
  if (!plan.concurrent && best.concurrent) notes.push("Separate appointments")
  const difference = plan.price.total - best.price.total
  if (difference !== 0) notes.push(priceDifference(difference))
  return notes
}

function finishDraft(request: ServiceRequest, draft: Draft) {
  const schedule = requestSchedule(request)
  const separateVisits =
    draft.assignments.flatMap((item) => item.parts).filter((part) => !part.primary).length +
    (draft.concurrent ? 0 : Math.max(draft.assignments.length - 1, 0)) +
    ((draft.visits ?? 1) - 1)
  return {
    visits: draft.visits ?? 1,
    id: draft.id,
    title: draft.title,
    description: draft.description,
    assignments: draft.assignments,
    helperIds: draft.assignments.map((item) => item.helperId),
    hours: elapsedHours(draft),
    concurrent: draft.concurrent,
    availability: checkAvailability(draft, schedule),
    price: priceAssignments(request, draft.assignments, separateVisits),
  }
}

/** Only realistic structures are returned, with exactly one best match. */
export function generatePlans(request: ServiceRequest, options: GenerateOptions = {}): GeneratedPlan[] {
  if (request.tasks.length === 0) return []
  const saved = options.savedHelpers ?? []
  const drafts = [soloDraft(request, saved), teamDraft(request, saved), specialistsDraft(request, saved)]
    .filter((draft): draft is Draft => draft !== null)
    .map((draft) => applyOverrides(draft, options.overrides, request.tasks))
  // Every extra helper has to save time, or the package has no reason to cost more.
  const slower = slowerPackages(request, drafts)
  const plans = drafts
    .filter((draft) => !slower.includes(draft.id))
    .map((draft) => finishDraft(request, draft))
    .map((plan) => ({
      ...plan,
      score: scorePlan(plan),
      isBest: false,
      isFastest: false,
      tradeoff: "",
      tradeoffParts: [] as string[],
    }))
  if (plans.length === 0) return []
  const best = [...plans].sort((a, b) => b.score - a.score)[0]
  best.isBest = true
  const fits = plans.filter((plan) => plan.availability.status === "fits")
  const fastest = fits.find(
    (plan) => plan !== best && plan.hours < best.hours && fits.every((other) => plan.hours <= other.hours),
  )
  if (fastest) fastest.isFastest = true
  plans.forEach((plan) => {
    if (plan === best) return
    plan.tradeoffParts = describeTradeoff(plan, best)
    plan.tradeoff = `${[plan.title, ...plan.tradeoffParts].join(" · ")}.`
  })
  return plans
}

export type HelperCandidate = {
  helperId: string
  available: boolean
  nextDate: string | null
  score: number
}

/** People who could fill one role in a plan, best first. */
export function candidatesForSlot(
  request: ServiceRequest,
  plan: GeneratedPlan,
  slot: number,
  savedHelpers: string[] = [],
): HelperCandidate[] {
  const assignment = plan.assignments[slot]
  if (!assignment) return []
  const categories = categoriesOf(request.tasks.filter((task) => assignment.taskIds.includes(task.id)))
  // A plan offered for a later date is judged against that date.
  const schedule: Schedule =
    plan.availability.status === "later" && plan.availability.nextDate
      ? { date: { kind: "specific", date: plan.availability.nextDate }, time: request.timePreference }
      : requestSchedule(request)
  const others = plan.helperIds.filter((_, index) => index !== slot)
  return eligibleHelpers(request, categories)
    .filter((helper) => !others.includes(helper.id))
    .map((helper) => {
      const draft: Draft = {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        concurrent: plan.concurrent,
        visits: plan.visits,
        assignments: plan.assignments.map((item, index) => (index === slot ? { ...item, helperId: helper.id } : item)),
      }
      const availability = checkAvailability(draft, schedule)
      return {
        helperId: helper.id,
        available: availability.status === "fits",
        nextDate: availability.status === "later" ? availability.nextDate : null,
        score: scoreHelper(helper, categories, schedule, assignment.hours, request, savedHelpers),
      }
    })
    .sort((a, b) => Number(b.available) - Number(a.available) || b.score - a.score)
}

/** What the plan would cost with a different person in one role. */
export function replacementTotal(request: ServiceRequest, plan: GeneratedPlan, slot: number, helperId: string) {
  const assignments = plan.assignments.map((item, index) => (index === slot ? { ...item, helperId } : item))
  const separateVisits =
    assignments.flatMap((item) => item.parts).filter((part) => !part.primary).length +
    (plan.concurrent ? 0 : Math.max(assignments.length - 1, 0)) +
    (plan.visits - 1)
  return priceAssignments(request, assignments, separateVisits).total
}

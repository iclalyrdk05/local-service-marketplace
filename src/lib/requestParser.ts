import { otherActionWords, serviceCatalog, taskAliases } from "../data/serviceCatalog"
import type {
  Clarification,
  ClarificationOption,
  DatePreference,
  DayPart,
  ServiceRequest,
  ServiceTask,
  TaskCategory,
  TimePreference,
} from "../types"
import { findMissing, generateQuestions } from "./questionGenerator"
import { addDays, capitalize, describeDate, resolveWeekday, TODAY, toIso, weekStart } from "./schedule"

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, couple: 2,
}
const NUMBER = "\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve"
const toNumber = (value: string) => Number(value) || WORD_NUMBERS[value] || 0
const WEEKDAY = "monday|tuesday|wednesday|thursday|friday|saturday|sunday"
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
const MONTH = `${MONTHS.join("|")}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec`

// Words people type for services and dates. Small typos of these get fixed,
// so "cookign" or "laundy" still count.
const KNOWN_WORDS = [
  "laundry", "tailoring", "tailored", "altering", "alterations", "cooking", "cooked", "dinner", "lunches",
  "cleaning", "cleaned", "organize", "organizing", "organization", "declutter", "decluttering", "ironing",
  "groceries", "closet", "apartment", "kitchen", "bathroom", "bedroom", "living", "cabinets", "garage",
  "january", "february", "march", "april", "august", "september", "october", "november", "december",
  "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "weekend",
  "morning", "afternoon", "evening",
]
// Real words that sit one letter away from a known word and must stay as typed.
const KEEP_WORDS = new Set(["closest", "closets", "kitchens", "dinners", "mornings", "evenings", "weekends", "cooker", "cleaner", "cleaners", "organizer", "organized"])

/** True when a and b differ by one added, dropped or swapped letter. */
function oneSlip(a: string, b: string) {
  if (a === b) return false
  if (a.length === b.length) {
    const diff = [...a].map((char, index) => (char === b[index] ? -1 : index)).filter((index) => index >= 0)
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  if (long.length - short.length !== 1) return false
  for (let index = 0; index < long.length; index += 1) {
    if (long.slice(0, index) + long.slice(index + 1) === short) return true
  }
  return false
}

function fixTypos(text: string) {
  return text.replace(/[a-z]{6,}/g, (word) => {
    if (KEEP_WORDS.has(word) || KNOWN_WORDS.includes(word)) return word
    return KNOWN_WORDS.find((known) => oneSlip(word, known)) ?? word
  })
}

function normalize(text: string) {
  return fixTypos(text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim())
}

/** Phrases that look like timing but describe the job. */
function maskNonTiming(text: string) {
  return text.replace(/\b(meals?|food|lunches|dinners)\s+for\s+the\s+week\b/g, (match) => " ".repeat(match.length))
}

type Timing = {
  date?: DatePreference
  time?: TimePreference
  uncertain?: string
  choices?: DatePreference[]
  choiceLabels?: string[]
  hasDateWords: boolean
}

function clock(hourText: string, minuteText: string | undefined, period: string | undefined) {
  let hour = Number(hourText)
  if (hour > 23) return null
  const minutes = minuteText ? Number(minuteText) / 60 : 0
  if (period) {
    hour = (hour % 12) + (period.startsWith("p") ? 12 : 0)
  } else if (hour <= 7) {
    hour += 12
  }
  return hour + minutes
}

function partFrom(text: string): DayPart | null {
  if (/\bmorning\b/.test(text)) return "morning"
  if (/\bafternoon\b/.test(text)) return "afternoon"
  if (/\b(evening|tonight|night)\b/.test(text)) return "evening"
  return null
}

function windowPreference(start: string, end: string, label: string, flexible: boolean): DatePreference {
  return { kind: "window", start, end, label, flexible }
}

function weekdayDate(name: string, modifier?: string) {
  const mod = modifier === "this" || modifier === "next" ? modifier : null
  return resolveWeekday(name, mod)
}

function monthDate(monthText: string, dayNumber: number) {
  const index = MONTHS.findIndex((item) => item.startsWith(monthText.slice(0, 3)))
  if (index < 0 || dayNumber < 1 || dayNumber > 31) return null
  return toIso(new Date(2026, index, dayNumber))
}

/** "the 21st": this month if it is still ahead, otherwise next month. */
function dayOfMonthAhead(dayNumber: number) {
  if (dayNumber < 1 || dayNumber > 31) return null
  const today = new Date(`${TODAY}T12:00:00`)
  const month = dayNumber >= today.getDate() ? today.getMonth() : today.getMonth() + 1
  return toIso(new Date(today.getFullYear(), month, dayNumber))
}

function describeDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric" })
}

export function extractTiming(input: string): Timing {
  const text = maskNonTiming(input)
  const result: Timing = { hasDateWords: false }

  const onlyDateFlexible = /\b(?:date|day)s?\s+(?:is|are|can be)\s+flexible\b|\bflexible\s+(?:date|day)s?\b|\bany day\b/.test(text)
  const onlyTimeFlexible = /\btimes?\s+(?:is|are|can be)\s+flexible\b|\bflexible\s+times?\b|\bany ?time of (?:the )?day\b/.test(text)
  const bothFlexible =
    !onlyDateFlexible && !onlyTimeFlexible &&
    /\b(?:doesn'?t|does not|don'?t|do not)\s+(?:really\s+)?(?:matter|care)\b|\bno (?:rush|preference)\b|\bwhenever\b|\bany ?time\b|\bflexible\b|\bat your convenience\b/.test(text)
  const softDate = /\bsometime\b/.test(text)
  const dateIsFlexible = onlyDateFlexible || bothFlexible || softDate

  const dates: Array<{ value: DatePreference; label: string }> = []
  const push = (value: DatePreference, label: string) => dates.push({ value, label })
  const deadlineWord = "before|by|until|no later than"
  const claimed: Array<[number, number]> = []
  const claim = (match: RegExpExecArray) => claimed.push([match.index, match.index + match[0].length])
  const isClaimed = (index: number) => claimed.some(([from, to]) => index >= from && index < to)

  for (const match of text.matchAll(new RegExp(`\\b(${deadlineWord})\\s+(this\\s+|next\\s+)?(${WEEKDAY})\\b`, "g"))) {
    push({ kind: "deadline", date: weekdayDate(match[3], match[2]?.trim()) }, capitalize(match[3]))
    claim(match as RegExpExecArray)
  }
  for (const match of text.matchAll(new RegExp(`\\b(${deadlineWord})\\s+(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "g"))) {
    const iso = monthDate(match[2], Number(match[3]))
    if (iso) push({ kind: "deadline", date: iso }, `${capitalize(match[2])} ${match[3]}`)
    claim(match as RegExpExecArray)
  }
  for (const match of text.matchAll(new RegExp(`\\b(${deadlineWord})\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH})\\b`, "g"))) {
    if (isClaimed(match.index ?? 0)) continue
    const iso = monthDate(match[3], Number(match[2]))
    if (iso) push({ kind: "deadline", date: iso }, `${capitalize(match[3])} ${match[2]}`)
    claim(match as RegExpExecArray)
  }
  for (const match of text.matchAll(new RegExp(`\\b(${deadlineWord})\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b(?!\\s+(?:of\\s+)?(?:${MONTH}))`, "g"))) {
    if (isClaimed(match.index ?? 0)) continue
    const iso = dayOfMonthAhead(Number(match[2]))
    if (iso) push({ kind: "deadline", date: iso }, describeDay(iso))
    claim(match as RegExpExecArray)
  }
  for (const match of text.matchAll(/\b(before|by|until)\s+tomorrow\b/g)) {
    push({ kind: "deadline", date: addDays(TODAY, 1) }, "Tomorrow")
    claim(match as RegExpExecArray)
  }

  const add = (pattern: RegExp, build: (match: RegExpExecArray) => void) => {
    for (const match of text.matchAll(pattern)) {
      if (isClaimed(match.index ?? 0)) continue
      build(match as RegExpExecArray)
      claim(match as RegExpExecArray)
    }
  }
  const monday = weekStart(TODAY)
  add(/\b(?:later )?this week(?:end)?\b/g, (match) => {
    if (match[0].endsWith("end")) push(windowPreference(addDays(monday, 5), addDays(monday, 6), "This weekend", dateIsFlexible), "This weekend")
    else push(windowPreference(TODAY, addDays(monday, 6), "This week", dateIsFlexible), "This week")
  })
  add(/\bnext week(?:end)?\b/g, (match) => {
    if (match[0].endsWith("end")) push(windowPreference(addDays(monday, 12), addDays(monday, 13), "Next weekend", dateIsFlexible), "Next weekend")
    else push(windowPreference(addDays(monday, 7), addDays(monday, 13), "Next week", dateIsFlexible), "Next week")
  })
  add(/\bas soon as possible\b|\basap\b/g, () => push(windowPreference(TODAY, addDays(TODAY, 2), "As soon as possible", true), "As soon as possible"))
  add(/\btoday\b|\btonight\b/g, () => push({ kind: "specific", date: TODAY }, "Today"))
  add(/\btomorrow\b/g, () => push({ kind: "specific", date: addDays(TODAY, 1) }, "Tomorrow"))
  add(new RegExp(`\\b(this |next |on |every )?(${WEEKDAY})s?\\b`, "g"), (match) => {
    const modifier = match[1]?.trim()
    push({ kind: "specific", date: weekdayDate(match[2], modifier) }, capitalize(match[2]))
  })
  add(new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "g"), (match) => {
    const iso = monthDate(match[1], Number(match[2]))
    if (iso) push({ kind: "specific", date: iso }, `${capitalize(match[1])} ${match[2]}`)
  })
  add(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH})\\b`, "g"), (match) => {
    const iso = monthDate(match[2], Number(match[1]))
    if (iso) push({ kind: "specific", date: iso }, `${capitalize(match[2])} ${match[1]}`)
  })
  add(new RegExp(`\\bon\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b`, "g"), (match) => {
    const iso = dayOfMonthAhead(Number(match[1]))
    if (iso) push({ kind: "specific", date: iso }, describeDay(iso))
  })
  add(/\b(\d{1,2})\/(\d{1,2})\b/g, (match) => {
    const iso = toIso(new Date(2026, Number(match[1]) - 1, Number(match[2])))
    push({ kind: "specific", date: iso }, match[0])
  })

  const vague = /\b(next month|soon|at some point|in a (?:few|couple)(?: of)? (?:days|weeks)|one of these days)\b/.exec(text)

  result.hasDateWords = dates.length > 0
  const hasOr = dates.length > 1 && /\bor\b/.test(text)
  if (hasOr) {
    result.choices = dates.map((item) => item.value)
    result.choiceLabels = dates.map((item) => item.label)
    const orMatch = new RegExp(`(?:${dates.map((item) => item.label.toLowerCase()).join("|")})[a-z ]* or [a-z ]*(?:${dates.map((item) => item.label.toLowerCase()).join("|")})`).exec(text)
    result.uncertain = orMatch?.[0] ?? dates.map((item) => item.label).join(" or ")
  } else if (dates.length > 0) {
    result.date = dates[0].value
  } else if (vague && !dateIsFlexible) {
    result.uncertain = vague[0]
  } else if (dateIsFlexible && (onlyDateFlexible || bothFlexible)) {
    result.date = { kind: "flexible", start: addDays(TODAY, 1), end: addDays(TODAY, 14) }
  }

  const beforeHour = /\b(?:before|by|until)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/.exec(text)
  const afterHour = /\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/.exec(text)
  const atHour = /\b(?:at|around|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b|\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(text)
  const part = partFrom(text)
  if (onlyTimeFlexible || bothFlexible) {
    result.time = { kind: "flexible" }
  } else if (/\b(?:at )?noon\b/.test(text)) {
    result.time = /\bbefore noon\b/.test(text) ? { kind: "before", hour: 12 } : /\bafter noon\b/.test(text) ? { kind: "after", hour: 12 } : { kind: "exact", hour: 12 }
  } else if (beforeHour) {
    const hour = clock(beforeHour[1], beforeHour[2], beforeHour[3])
    if (hour !== null) result.time = { kind: "before", hour }
  } else if (afterHour) {
    const hour = clock(afterHour[1], afterHour[2], afterHour[3])
    if (hour !== null) result.time = { kind: "after", hour }
  } else if (atHour) {
    const hour = clock(atHour[1] ?? atHour[4], atHour[2] ?? atHour[5], atHour[3] ?? atHour[6])
    if (hour !== null) result.time = { kind: "exact", hour }
  } else if (part) {
    const deadline = result.date?.kind === "deadline"
    result.time = deadline ? { kind: "before-part", part } : { kind: "part", part }
  }
  return result
}

type Mention = { category: TaskCategory; start: number; end: number; phrase: string }

function findMentions(text: string): Mention[] {
  const mentions: Mention[] = []
  const overlaps = (start: number, end: number) => mentions.some((item) => start < item.end && end > item.start)
  for (const alias of taskAliases) {
    for (const match of text.matchAll(alias.pattern)) {
      const start = match.index ?? 0
      const end = start + match[0].length
      if (overlaps(start, end)) continue
      mentions.push({ category: alias.category, start, end, phrase: match[0] })
    }
  }
  return mentions.sort((a, b) => a.start - b.start)
}

function splitClauses(text: string) {
  return text
    .split(/[.;!?\n]+|\bbut\b|\bhowever\b/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitFragments(clause: string) {
  return clause
    .split(/,|\band\b(?! fold)|\bplus\b/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const CLEAN_TARGETS = /\b(?:cabinets?|cupboards?|fridge|refrigerator|oven|stove|microwave|windows?|baseboards?|shelves|drawers?)\b/g
const SEASONAL_CLOTHES = /\b(?:winter|summer|spring|fall|autumn|seasonal|off-season)\s+(?:clothes|clothing|wardrobe|items|stuff|things)\b/
const singular = (word: string) => word === "shelves" ? "shelf" : word.replace(/s$/, "")

const GARMENTS = "prom dress|wedding dress|dress|pants|jeans|trousers|shirt|blouse|suit|jacket|skirt|coat"

function garmentDetails(text: string) {
  const items: Array<{ garment: string; count: number; pairs: boolean; alteration: string }> = []
  const pattern = new RegExp(`(?:\\b(${NUMBER}|couple of)\\s+)?(?:(pairs?)\\s+of\\s+)?(?:my\\s+|the\\s+)?\\b(${GARMENTS})(s|es)?\\b`, "g")
  for (const match of text.matchAll(pattern)) {
    const count = match[1] ? toNumber(match[1].replace(" of", "")) || 1 : 1
    // Only this garment's own words: stop at the neighboring "and" or comma.
    const start = match.index ?? 0
    const after = text.slice(start + match[0].length, start + match[0].length + 24).split(/\band\b|,/)[0]
    const before = text.slice(Math.max(0, start - 24), start).split(/\band\b|,/).pop() ?? ""
    const nearby = `${before} ${after}`
    const alteration = /shorten|hem/.test(nearby)
      ? "Shorten"
      : /take in|taken in/.test(nearby)
        ? "Take in"
        : /let out/.test(nearby)
          ? "Let out"
          : /fix|repair|mend/.test(nearby)
            ? "Repair"
            : "Alter"
    items.push({ garment: match[3], count, pairs: Boolean(match[2]), alteration })
  }
  return items
}

function buildTask(category: TaskCategory, fragment: string, whole: string, id: string): ServiceTask {
  const details: Record<string, unknown> = {}
  const answers: Record<string, string> = {}
  let title = serviceCatalog[category].name
  let description: string | undefined

  if (category === "cleaning") {
    const rooms = [...new Set(fragment.match(/\b(?:living room|dining room|bedroom|bathroom|kitchen)\b/g) ?? [])]
    const full = /\b(?:fully|full|whole|entire|top to bottom|everything)\b/.test(fragment)
    const reset = /\breset\b/.test(fragment)
    const guests = /ready for guests|guest[- ]ready/.test(fragment)
    const targets = [...new Set((fragment.match(CLEAN_TARGETS) ?? []).map(singular))]
    if (targets.length && !full) {
      details.scope = "items"
      details.targets = targets
      details.rooms = rooms
    } else if (rooms.length && !full) {
      details.scope = "rooms"
      details.rooms = rooms
      answers.scope = "Selected rooms"
    } else if (full) {
      details.scope = "full"
      answers.scope = "Full home"
    }
    if (/\bdeep/.test(fragment)) answers.depth = "Deep clean"
    title = details.scope === "items"
      ? capitalize(`${rooms.length ? `${rooms.join(" and ")} ` : ""}${targets.join(" and ")} cleaning`)
      : reset && rooms.length
      ? `Reset the ${rooms.join(" and ")}`
      : guests
        ? "Guest-ready reset"
        : /\bdeep/.test(fragment)
          ? rooms.length ? `Deep clean the ${rooms.join(" and ")}` : "Deep home cleaning"
          : full
            ? "Full home cleaning"
            : rooms.length
              ? `Clean the ${rooms.join(" and ")}`
              : "Home cleaning"
    if (guests) details.occasion = "guests"
  }

  if (category === "laundry") {
    const loads = new RegExp(`\\b(${NUMBER})\\s+loads?\\b`).exec(fragment)
    if (loads) {
      const count = toNumber(loads[1])
      details.loads = count
      answers.loads = count <= 2 ? "1–2" : count <= 4 ? "3–4" : "5+"
    }
    if (/\biron/.test(fragment)) answers.ironing = "Yes"
    if (/wash and fold|wash-and-fold/.test(fragment)) answers.service = "Wash and fold"
    if (/pick ?up|pick it up/.test(fragment)) answers.machine = "Pickup and return"
    title = /dry[- ]?clean/.test(fragment) ? "Dry cleaning" : answers.ironing ? "Laundry and ironing" : "Laundry"
  }

  if (category === "meal-prep") {
    const weekly = /\bweekly\b|\bfor the week\b|\bevery\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(whole)
    const named = new RegExp(`\\b(dinner|lunch|brunch|breakfast|cook|cooking|meals?|food)\\s+for\\s+(${NUMBER})\\b`).exec(fragment)
    const meals = new RegExp(`\\b(${NUMBER})\\s+meals?\\b`).exec(fragment)
    const people = new RegExp(`\\b(${NUMBER})\\s+(?:guests|people|persons|servings|adults)\\b`).exec(whole) ?? named?.slice(1)
    if (weekly) details.weekly = true
    if (meals) {
      const count = toNumber(meals[1])
      details.meals = count
      answers.meals = count <= 3 ? "3" : count <= 5 ? "5" : "7"
    }
    const servingsText = Array.isArray(people) ? (people[1] as string) : undefined
    if (servingsText) {
      const count = toNumber(servingsText)
      details.servings = count
      answers.servings = count <= 2 ? "1–2" : count <= 4 ? "3–4" : count <= 6 ? "5–6" : "7+"
    }
    const diet = /\bvegan\b/.test(whole) ? "Vegan" : /\bvegetarian\b/.test(whole) ? "Vegetarian" : /gluten[- ]free/.test(whole) ? "Gluten-free" : null
    if (diet) answers.diet = diet
    if (/\bno allerg/.test(whole)) answers.allergies = "None"
    title = weekly
      ? "Weekly meal preparation"
      : named
        ? /^(dinner|lunch|brunch|breakfast)$/.test(named[1])
          ? `Prepare ${named[1]} for ${named[2]}`
          : `Cook for ${named[2]}`
        : /\bdinner\b/.test(fragment)
          ? "Prepare dinner"
          : "Meal preparation"
  }

  if (category === "organization") {
    const cabinets = /\bcabinets?\b|\bcupboards?\b|\bdrawers?\b/.test(fragment)
    // Seasonal clothes anywhere in the request means the closet.
    const seasonal = SEASONAL_CLOTHES.test(whole) || /\b(?:clothes|clothing|sweaters|coats)\b/.test(fragment)
    const area = /\bcloset|wardrobe\b/.test(fragment) || seasonal
      ? "Closet"
      : /\bpantry\b/.test(fragment)
        ? "Pantry"
        : /\bgarage\b/.test(fragment)
          ? "Garage"
          : /\bkitchen\b/.test(fragment)
            ? "Kitchen"
            : /\bbathroom\b/.test(fragment)
              ? "Bathroom"
              : /\broom\b/.test(fragment)
                ? "Whole room"
                : null
    if (cabinets) details.cabinets = true
    if (seasonal) details.seasonal = true
    if (area) answers.area = area
    if (/\bdeclutter/.test(fragment)) answers.mode = "Declutter too"
    title = seasonal
      ? "Seasonal closet swap"
      : cabinets
        ? area && area !== "Whole room" ? `Organize ${area.toLowerCase()} cabinets` : "Organize cabinets"
        : area === "Whole room"
          ? "Room organization"
          : area
            ? `${area} organization`
            : "Home organization"
  }

  if (category === "tailoring") {
    const garments = garmentDetails(fragment.length > 12 ? whole : fragment)
    const total = garments.reduce((sum, item) => sum + item.count, 0)
    if (garments.length) {
      details.garments = garments
      details.garmentCount = total
      answers.garment = capitalize(garments[0].garment.split(" ").pop() ?? "Other")
      answers.count = total >= 4 ? "4+" : String(total)
      const alterations = [...new Set(garments.map((item) => item.alteration))]
      if (alterations.length === 1 && alterations[0] !== "Alter") answers.alteration = alterations[0]
      else if (alterations.length > 1) answers.alteration = "Mixed"
      description = garments
        .map((item) => {
          const amount = item.count > 1 ? `${item.count} ${item.pairs ? "pairs of " : ""}` : ""
          return `${capitalize(item.alteration)} ${amount}${item.garment}`
        })
        .join(", ")
    }
    title = garments.length === 1
      ? (description ?? "Tailoring")
      : total > 1
        ? `Alter ${total} garments`
        : "Tailoring"
  }

  if (category === "personal-care") {
    title = /thread|brow/.test(fragment) ? "Eyebrow threading" : /makeup|make-up/.test(fragment) ? "At-home makeup" : "Personal care"
  }

  if (/\bwhile i'?m (?:at work|out|away)\b|\bwon'?t be home\b/.test(whole) && serviceCatalog[category].questions.some((item) => item.id === "home")) {
    answers.home = "I won’t be home"
  }

  const task: ServiceTask = {
    id,
    category,
    title,
    description,
    details,
    answers,
    estimatedDuration: 0,
    status: "draft",
    sourceText: fragment.trim(),
  }
  task.estimatedDuration = estimateHours(task)
  return task
}

function roundHalf(value: number) {
  return Math.max(0.5, Math.round(value * 2) / 2)
}

/** Deterministic duration from what we know so far. */
export function estimateHours(task: ServiceTask) {
  const { answers, details } = task
  if (task.category === "cleaning") {
    const rooms = (details.rooms as string[] | undefined)?.length ?? 0
    const targets = (details.targets as string[] | undefined)?.length ?? 0
    if (details.scope === "items") return roundHalf((1 + 0.75 * targets) * (answers.depth === "Deep clean" ? 1.35 : 1))
    const base = answers.scope === "Selected rooms" || rooms
      ? 1 + 0.5 * Math.max(rooms, 1)
      : ({ Studio: 2.5, "1 bedroom": 3, "2 bedrooms": 4, "3+ bedrooms": 5.5 } as Record<string, number>)[answers.size] ?? 3.5
    return roundHalf(answers.depth === "Deep clean" ? base * 1.35 : base)
  }
  if (task.category === "laundry") {
    const loads = (details.loads as number | undefined) ?? ({ "1–2": 2, "3–4": 4, "5+": 6 } as Record<string, number>)[answers.loads] ?? 2
    return roundHalf(loads * 0.75 + (answers.ironing === "Yes" ? 0.75 : 0))
  }
  if (task.category === "meal-prep") {
    if (details.weekly) {
      const meals = (details.meals as number | undefined) ?? (Number(answers.meals) || 5)
      return roundHalf(1 + meals * 0.5)
    }
    return answers.servings === "7+" ? 3 : 2.5
  }
  if (task.category === "organization") {
    const base = ({ Closet: 2, Kitchen: 1.5, Pantry: 1.5, "Whole room": 2.5, Garage: 4 } as Record<string, number>)[answers.area] ?? 2
    const size = ({ Small: -0.5, Large: 1 } as Record<string, number>)[answers.size] ?? 0
    return roundHalf(base + size + (answers.mode === "Declutter too" ? 0.5 : 0))
  }
  if (task.category === "tailoring") {
    const count = (details.garmentCount as number | undefined) ?? (parseInt(answers.count ?? "1", 10) || 1)
    return roundHalf(Math.max(1, count * 0.5))
  }
  if (task.category === "personal-care") return 1
  return 2
}

/** Recalculate everything that depends on tasks and answers. */
export function refreshRequest(request: ServiceRequest): ServiceRequest {
  const tasks = request.tasks.map((task) => ({ ...task, estimatedDuration: estimateHours(task) }))
  const next = { ...request, tasks }
  return {
    ...next,
    confidence: next.clarification ? "low" : "high",
    unansweredQuestions: generateQuestions(next),
    missing: findMissing(next),
  }
}

export function emptyRequest(location?: string): ServiceRequest {
  return { rawText: "", tasks: [], location, unansweredQuestions: [], missing: ["tasks", "date", "time"], confidence: "high", notices: [] }
}

let taskCounter = 0
const nextTaskId = () => `task-${++taskCounter}`

function ambiguityFor(text: string, tasks: ServiceTask[]): Clarification | undefined {
  const closet = /\b(?:clean|cleaning)\s+(?:out\s+|up\s+)?(?:my |the |our )?(closet|wardrobe|garage|pantry)\b/.exec(text)
  if (closet) {
    const task = tasks.find((item) => item.category === "cleaning")
    if (task) {
      return {
        question: `Should we organize your ${closet[1]} or clean it?`,
        originalWording: closet[0],
        options: [
          { label: "Organize it", apply: { kind: "set-category", taskId: task.id, category: "organization" } },
          { label: "Clean it", apply: { kind: "keep-task", taskId: task.id } },
        ],
      }
    }
  }
  return undefined
}

function otherClarification(task: ServiceTask): Clarification {
  const wording = task.sourceText ?? task.title
  const categories: Array<[string, TaskCategory]> = [["Cleaning", "cleaning"], ["Laundry", "laundry"], ["Meals", "meal-prep"], ["Organizing", "organization"]]
  const options: ClarificationOption[] = categories.map(([label, category]) => ({
    label,
    apply: { kind: "set-category", taskId: task.id, category },
  }))
  options.push({ label: "Something else", apply: { kind: "keep-task", taskId: task.id } })
  return { question: `What kind of help is “${wording}”?`, originalWording: wording, options }
}

function dateClarification(timing: Timing, wording: string): Clarification {
  const options: ClarificationOption[] = (timing.choices ?? []).map((date, index) => ({
    label: timing.choiceLabels?.[index] ?? describeDate(date).label,
    apply: { kind: "set-date", date },
  }))
  options.push({
    label: options.length ? "Either works" : "Flexible",
    apply: { kind: "set-date", date: flexibleEitherDate(timing) },
  })
  if (options.length === 1) {
    options.unshift(
      { label: "This week", apply: { kind: "set-date", date: { kind: "window", start: TODAY, end: addDays(weekStart(TODAY), 6), label: "This week", flexible: true } } },
      { label: "Next week", apply: { kind: "set-date", date: { kind: "window", start: addDays(weekStart(TODAY), 7), end: addDays(weekStart(TODAY), 13), label: "Next week", flexible: true } } },
    )
  }
  return { question: `When you said “${wording}”, which works best?`, originalWording: wording, options }
}

function flexibleEitherDate(timing: Timing): DatePreference {
  const dates = (timing.choices ?? [])
    .filter((item): item is Extract<DatePreference, { kind: "specific" }> => item.kind === "specific")
    .map((item) => item.date)
    .sort()
  if (dates.length > 1) {
    return { kind: "window", start: dates[0], end: dates[dates.length - 1], label: `${timing.choiceLabels?.join(" or ")}`, flexible: true }
  }
  return { kind: "flexible", start: addDays(TODAY, 1), end: addDays(TODAY, 14) }
}

type Unit = { text: string; timing: Timing; categories: Set<TaskCategory> }

function buildUnits(text: string): Unit[] {
  const units: Unit[] = []
  for (const clause of splitClauses(text)) {
    const timing = extractTiming(clause)
    const dateCount = countDates(clause)
    const pieces = dateCount > 1 && !timing.choices ? splitFragments(clause) : [clause]
    for (const piece of pieces) {
      units.push({
        text: piece,
        timing: pieces.length > 1 ? extractTiming(piece) : timing,
        categories: new Set(findMentions(piece).map((item) => item.category)),
      })
    }
  }
  return units
}

function countDates(clause: string) {
  return (maskNonTiming(clause).match(new RegExp(`\\b(?:today|tomorrow|tonight|${WEEKDAY}|this week(?:end)?|next week(?:end)?)\\b`, "g")) ?? []).length
}

function otherFragments(text: string) {
  const found: string[] = []
  for (const clause of splitClauses(text)) {
    for (const fragment of splitFragments(clause)) {
      if (findMentions(fragment).length) continue
      // "take the winter clothes out" belongs to the closet task.
      if (/\b(?:clothes|clothing)\b/.test(fragment) && SEASONAL_CLOTHES.test(text)) continue
      const cleaned = fragment
        .replace(/^(?:also|please|then|i|we)\s+/, "")
        .replace(/^(?:also|please|need|want|would like)\s+/, "")
        .replace(/^(?:to\s+)?(?:have|get)?\s*(?:someone|somebody|a person|a helper)?\s*(?:to\s+)?/, "")
        .trim()
      if (otherActionWords.test(cleaned)) found.push(cleaned)
    }
  }
  return found
}

const REMOVE_WORDS = /\b(?:remove|skip|cancel|drop|forget|no longer need|don'?t need|do not need|without)\b/
const REPLACE_ALL_WORDS = /\b(?:everything|all of it|the whole (?:thing|request|booking)|instead|reschedule|move it|make it|change it)\b/

function createTasks(text: string, existing: ServiceTask[]) {
  const created: ServiceTask[] = []
  const updated: ServiceTask[] = []
  const categoriesSeen = new Set<TaskCategory>()
  splitClauses(text).flatMap(splitFragments).forEach((fragment) => {
    for (const mention of findMentions(fragment)) {
      if (categoriesSeen.has(mention.category)) continue
      categoriesSeen.add(mention.category)
      const source = fragment
      const match = existing.find((task) => task.category === mention.category)
      if (match) {
        const parsed = buildTask(mention.category, source, text, match.id)
        updated.push({
          ...match,
          details: { ...match.details, ...parsed.details },
          answers: { ...parsed.answers, ...match.answers },
        })
      } else {
        created.push(buildTask(mention.category, source, text, nextTaskId()))
      }
    }
  })
  return { created, updated }
}

function applyTimingToTasks(tasks: ServiceTask[], timing: Timing) {
  return tasks.map((task) => ({
    ...task,
    datePreference: timing.date ?? task.datePreference,
    timePreference: timing.time ?? task.timePreference,
  }))
}

function parseFresh(rawText: string, base: ServiceRequest): ServiceRequest {
  const text = normalize(rawText)
  let { created: tasks } = createTasks(text, [])
  const others = otherFragments(text).map((wording) => {
    const task = buildTask("other", wording, text, nextTaskId())
    task.title = capitalize(wording)
    return task
  })
  tasks = [...tasks, ...others]

  let clarification: Clarification | undefined
  if (tasks.length === 0) {
    const fallback = buildTask("other", rawText, text, nextTaskId())
    fallback.title = rawText.trim()
    fallback.sourceText = rawText.trim()
    tasks = [fallback]
    clarification = otherClarification(fallback)
  }

  const units = buildUnits(text)
  const allCategories = new Set(tasks.map((task) => task.category))
  let datePreference: DatePreference | undefined
  let timePreference: TimePreference | undefined
  let uncertain: Timing | undefined
  let uncertainWording = ""

  for (const unit of units) {
    const timing = unit.timing
    if (timing.uncertain) {
      uncertain = timing
      uncertainWording = timing.uncertain
      continue
    }
    if (!timing.date && !timing.time) continue
    const coversAll = unit.categories.size === 0 || unit.categories.size === allCategories.size
    if (coversAll) {
      datePreference = timing.date ?? datePreference
      timePreference = timing.time ?? timePreference
    } else {
      tasks = tasks.map((task) =>
        unit.categories.has(task.category)
          ? { ...task, datePreference: timing.date ?? task.datePreference, timePreference: timing.time ?? task.timePreference }
          : task,
      )
    }
  }

  // Without request-level timing, the first task-specific timing leads.
  if (!datePreference || !timePreference) {
    const lead = tasks.find((task) => task.datePreference || task.timePreference)
    if (lead) {
      datePreference = datePreference ?? lead.datePreference
      timePreference = timePreference ?? lead.timePreference
      tasks = tasks.map((task) =>
        task.id === lead.id ? { ...task, datePreference: undefined, timePreference: undefined } : task,
      )
    }
  }

  if (!clarification) clarification = ambiguityFor(text, tasks)
  if (!clarification) {
    const other = tasks.find((task) => task.category === "other")
    if (other) {
      clarification = {
        question: `Should a home helper take on “${other.title}”?`,
        originalWording: other.sourceText ?? other.title,
        options: [
          { label: "Yes, keep it", apply: { kind: "keep-task", taskId: other.id } },
          { label: "Remove it", apply: { kind: "remove-task", taskId: other.id } },
        ],
      }
    }
  }
  if (!clarification && uncertain) clarification = dateClarification(uncertain, uncertainWording)

  const ingredients = /\b(?:shop|buy (?:the )?(?:groceries|ingredients)|groceries)\b/.test(text)
    ? "Helper shops for ingredients"
    : /\b(?:i have|use my|use what i have)\b[a-z ]*\bingredients\b/.test(text)
      ? "Use what I have"
      : base.ingredients
  const access = /\bdoorman\b/.test(text) ? "Doorman" : /\blockbox\b/.test(text) ? "Lockbox" : /\bsmart[- ]?lock\b/.test(text) ? "Smart-lock code" : base.access

  return refreshRequest({
    ...base,
    rawText,
    tasks,
    datePreference,
    timePreference,
    ingredients,
    access,
    clarification,
    notices: [],
  })
}

function parseFollowUp(rawText: string, current: ServiceRequest): ServiceRequest {
  const text = normalize(rawText)
  const notices: string[] = []
  const combinedRaw = current.rawText ? `${current.rawText} ${rawText}` : rawText

  if (REMOVE_WORDS.test(text)) {
    const removing = new Set(findMentions(text).map((item) => item.category))
    const remaining = current.tasks.filter((task) => !removing.has(task.category))
    if (removing.size && remaining.length !== current.tasks.length) {
      const names = current.tasks.filter((task) => removing.has(task.category)).map((task) => task.title)
      return refreshRequest({ ...current, rawText: combinedRaw, tasks: remaining, clarification: undefined, notices: [`Removed ${names.join(" and ")}.`] })
    }
  }

  const { created, updated } = createTasks(text, current.tasks)
  const others = otherFragments(text).map((wording) => {
    const task = buildTask("other", wording, text, nextTaskId())
    task.title = capitalize(wording)
    return task
  })
  let newTasks = [...created, ...others]
  let changedTasks = updated
  const timing = extractTiming(text)
  const hasTiming = Boolean(timing.date || timing.time)
  let next: ServiceRequest = { ...current, rawText: combinedRaw }

  if (timing.uncertain) {
    next.clarification = dateClarification(timing, timing.uncertain)
  } else if (hasTiming) {
    const replacesAll = REPLACE_ALL_WORDS.test(text) && newTasks.length === 0 && updated.length === 0
    const timingOnly = newTasks.length === 0 && updated.length === 0
    if (replacesAll || timingOnly) {
      const before = describeDate(current.datePreference).label
      next.datePreference = timing.date ?? current.datePreference
      next.timePreference = timing.time ?? current.timePreference
      const after = describeDate(next.datePreference).label
      if (before && after && before !== after) notices.push(`Date changed from ${before} to ${after}.`)
      else notices.push("Updated your schedule.")
    } else {
      newTasks = applyTimingToTasks(newTasks, timing)
      changedTasks = applyTimingToTasks(changedTasks, timing)
    }
  }

  if (newTasks.length === 0 && changedTasks.length === 0 && !hasTiming && !timing.uncertain) {
    const fallback = buildTask("other", rawText, text, nextTaskId())
    fallback.title = rawText.trim()
    fallback.sourceText = rawText.trim()
    newTasks = [fallback]
    next.clarification = otherClarification(fallback)
  }

  if (newTasks.length) {
    const names = newTasks.map((task) => task.title).join(" and ")
    const timingNote = newTasks.some((task) => task.datePreference || task.timePreference)
      ? ` (${[describeDate(newTasks[0].datePreference).label, newTasks[0].timePreference?.kind === "flexible" ? "Flexible time" : ""].filter(Boolean).join(", ")})`
      : ""
    notices.push(`Added ${names}${timingNote}.`)
  }
  if (changedTasks.length) notices.push(`Updated ${changedTasks.map((task) => task.title).join(" and ")}.`)

  next.tasks = [
    ...current.tasks.map((task) => changedTasks.find((item) => item.id === task.id) ?? task),
    ...newTasks,
  ]
  next.notices = notices
  return refreshRequest(next)
}

/**
 * The one entry point for natural language. Without `current` it reads a new
 * request; with `current` it merges a follow-up and keeps existing answers.
 */
export function parseRequest(text: string, current?: ServiceRequest): ServiceRequest {
  if (!text.trim()) return current ?? emptyRequest()
  return current && current.tasks.length > 0
    ? parseFollowUp(text, current)
    : parseFresh(text, current ?? emptyRequest())
}

export function answerTaskQuestion(request: ServiceRequest, taskId: string, questionId: string, value: string) {
  return refreshRequest({
    ...request,
    tasks: request.tasks.map((task) => {
      if (task.id !== taskId) return task
      const answers = { ...task.answers }
      if (answers[questionId] === value) delete answers[questionId]
      else answers[questionId] = value
      return { ...task, answers }
    }),
  })
}

export function resolveClarification(request: ServiceRequest, option: ClarificationOption) {
  const { apply } = option
  let next: ServiceRequest = { ...request, clarification: undefined }
  if (apply.kind === "set-date") next = { ...next, datePreference: apply.date }
  if (apply.kind === "remove-task") next = { ...next, tasks: next.tasks.filter((task) => task.id !== apply.taskId) }
  if (apply.kind === "set-category") {
    next = {
      ...next,
      tasks: next.tasks.map((task) => {
        if (task.id !== apply.taskId) return task
        const source = normalize(task.sourceText ?? task.title)
        const rebuilt = buildTask(apply.category, source, source, task.id)
        return { ...rebuilt, sourceText: task.sourceText, datePreference: task.datePreference, timePreference: task.timePreference }
      }),
    }
  }
  return refreshRequest(next)
}

/** Build a task from a known title, for flows that start from a set list. */
export function taskFromTitle(title: string): ServiceTask {
  const parsed = parseFresh(title, emptyRequest())
  const task = parsed.tasks[0]
  return { ...task, title }
}

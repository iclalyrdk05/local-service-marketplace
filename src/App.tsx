import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { helperPhotos, providerById, providers, workingHoursOn } from "./data/helpers"
import { serviceCatalog } from "./data/serviceCatalog"
import {
  blockedLabel,
  packageGaps,
  type PackageGap,
  candidatesForSlot,
  generatePlans,
  replacementTotal,
} from "./lib/planGenerator"
import { priceDifference } from "./lib/pricing"
import { includesMeals, needsHomeAccess, openRequiredCount, questionsForTask, requiredQuestions } from "./lib/questionGenerator"
import {
  answerTaskQuestion,
  emptyRequest,
  parseRequest,
  refreshRequest,
  resolveClarification,
  taskFromTitle,
} from "./lib/requestParser"
import {
  addDays,
  describeDate,
  describeTime,
  fromIso,
  isoFromLongDate,
  longDate,
  mediumDate,
  shortDateIso,
  toIso,
  TODAY,
  weekStart,
  windowEnd,
} from "./lib/schedule"
import type {
  ClarificationOption,
  DatePreference,
  GeneratedPlan,
  PlanId,
  ServiceRequest,
  TimePreference,
} from "./types"

/** Explore stays in the code but is hidden from the product for now. */
const EXPLORE_ENABLED = false

type Screen = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
type NavPage = "home" | "explore" | "tasks" | "saved"
type MainView = "booking" | "explore" | "helpers" | "tasks" | "saved" | "profile" | "edit-profile" | "addresses" | "task-detail" | "provider-profile" | "messages" | "plan-details" | "inbox" | "thread" | "ui-kit" | "service"
type IconName = "alert" | "arrow-up-right" | "hanger" | "pot" | "scissors" | "washer" | "arrow-left" | "calendar" | "camera" | "card" | "check" | "chevron" | "clock" | "edit" | "explore" | "home" | "list" | "message" | "mic" | "minus" | "pin" | "plus" | "profile" | "saved" | "search" | "sparkle" | "upload" | "x"

const selectedDateLabel = "Saturday, October 24"
const selectedAddressLabel = "123 W 12th St, New York, NY 10011"

const request =
  "I have six guests coming on Saturday. I need dinner prepared, the living room reset, and my kitchen cabinets organized."

const tasks = [
  "Prepare dinner for 6 people",
  "Reset the living and dining area",
  "Organize kitchen cabinets",
]

const servicePhotos: Record<string, string> = {
  "Guest ready":
    "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=320&q=80",
  "Weekly reset":
    "https://images.unsplash.com/photo-1632829882891-5047ccc421bc?auto=format&fit=crop&w=320&q=80",
  "Return home":
    "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=320&q=80",
  "Move-in reset":
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=320&q=80",
  "Weekly meal preparation":
    "https://images.unsplash.com/photo-1636647511729-6703539ba71f?auto=format&fit=crop&w=320&q=80",
  "Home-cooked meals":
    "https://images.unsplash.com/photo-1656711829545-91481f306b88?auto=format&fit=crop&w=320&q=80",
  "Fridge restocking":
    "https://images.unsplash.com/photo-1605522283494-4901a98d458e?auto=format&fit=crop&w=320&q=80",
  "Kitchen organization":
    "https://images.unsplash.com/photo-1744104135578-6768f2061be1?auto=format&fit=crop&w=320&q=80",
  Alterations:
    "https://images.unsplash.com/photo-1710432104395-23e03b77e750?auto=format&fit=crop&w=320&q=80",
  Tailoring:
    "https://images.unsplash.com/photo-1699570046899-dcd5bb4c803d?auto=format&fit=crop&w=320&q=80",
  "Pickup and return":
    "https://images.unsplash.com/photo-1771440048464-5ffc7d005142?auto=format&fit=crop&w=320&q=80",
  "Wardrobe organization":
    "https://images.unsplash.com/photo-1778731660303-1fa5ede75477?auto=format&fit=crop&w=320&q=80",
  Styling:
    "https://images.unsplash.com/photo-1675034743339-0b0747047727?auto=format&fit=crop&w=320&q=80",
  "Eyebrow threading":
    "https://images.unsplash.com/photo-1675034742143-151fc66c9d0b?auto=format&fit=crop&w=320&q=80",
  "At-home beauty services":
    "https://images.unsplash.com/photo-1647462741268-e5724e5886c0?auto=format&fit=crop&w=320&q=80",
  "Tailoring Service":
    "https://images.unsplash.com/photo-1710432104395-23e03b77e750?auto=format&fit=crop&w=320&q=80",
  "Home Organization":
    "https://images.unsplash.com/photo-1778731660303-1fa5ede75477?auto=format&fit=crop&w=320&q=80",
  "Weekly Meal Preparation":
    "https://images.unsplash.com/photo-1636647511729-6703539ba71f?auto=format&fit=crop&w=320&q=80",
  "Your Service Plan":
    "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=320&q=80",
}

type ServiceCategory = "home" | "food" | "clothing" | "personal"
type ServiceOption = { title: string; question: string; options: string[] }
type ServiceInfo = {
  title: string
  category: ServiceCategory
  tagline: string
  hours: number
  price: number
  tasks: string[]
  includes: string[]
  helperIds: string[]
  option?: ServiceOption
}

const exploreGroups = [
  {
    title: "Home resets",
    tone: "sage",
    items: ["Guest ready", "Weekly reset", "Return home", "Move-in reset"],
  },
  {
    title: "Food and home",
    tone: "yellow",
    items: [
      "Weekly meal preparation",
      "Home-cooked meals",
      "Fridge restocking",
      "Kitchen organization",
    ],
  },
  {
    title: "Clothing care",
    tone: "coral",
    items: [
      "Alterations",
      "Tailoring",
      "Pickup and return",
      "Wardrobe organization",
    ],
  },
  {
    title: "Personal care",
    tone: "sage",
    items: ["Styling", "Eyebrow threading", "At-home beauty services"],
  },
]

const suppliesOption: ServiceOption = {
  title: "Supplies",
  question: "Who should bring supplies?",
  options: ["Helper brings supplies", "Use what I have", "Decide later"],
}

const categoryOptions: Record<ServiceCategory, ServiceOption> = {
  home: suppliesOption,
  food: {
    title: "Ingredients",
    question: "How should ingredients be handled?",
    options: ["Use what I have", "Helper shops for ingredients", "Decide later"],
  },
  clothing: {
    title: "Garments",
    question: "How should we handle your garments?",
    options: ["In-home fitting", "Pickup and return", "Drop off at studio"],
  },
  personal: {
    title: "Preferences",
    question: "Anything we should plan for?",
    options: ["No preference", "Sensitive skin", "I have my own products"],
  },
}

const categoryLabels: Record<ServiceCategory, string> = {
  home: "Home resets",
  food: "Food and home",
  clothing: "Clothing care",
  personal: "Personal care",
}

const homeHelpers = ["jasmine", "maria", "nora"]

const services: Record<string, ServiceInfo> = {
  "Guest ready": {
    title: "Guest ready",
    category: "home",
    tagline: "Get your home clean, calm, and ready before guests arrive.",
    hours: 3.5,
    price: 248,
    tasks: ["Reset living and dining areas", "Refresh kitchen and bathroom", "Prepare the guest setup"],
    includes: ["Living and dining room reset", "Kitchen and bathroom refresh", "Fresh linens and towels set out", "Final walkthrough before you host"],
    helperIds: homeHelpers,
  },
  "Weekly reset": {
    title: "Weekly reset",
    category: "home",
    tagline: "A steady weekly routine that keeps your home under control.",
    hours: 2.5,
    price: 156,
    tasks: ["Tidy shared spaces", "Clean kitchen surfaces", "Fold and put away laundry"],
    includes: ["Tidying of shared rooms", "Kitchen and surface cleaning", "Laundry folded and put away", "Same helper each week when available"],
    helperIds: homeHelpers,
  },
  "Return home": {
    title: "Return home",
    category: "home",
    tagline: "Come back from a trip to a fresh, restocked, welcoming home.",
    hours: 3,
    price: 184,
    tasks: ["Air out and tidy the home", "Change bed linens", "Stock breakfast essentials"],
    includes: ["Full tidy and air out", "Fresh bed linens", "Mail and packages sorted", "Breakfast essentials stocked"],
    helperIds: homeHelpers,
  },
  "Move-in reset": {
    title: "Move-in reset",
    category: "home",
    tagline: "Start in your new place with clean rooms and unpacked essentials.",
    hours: 5,
    price: 318,
    tasks: ["Deep clean kitchen and bathroom", "Unpack kitchen essentials", "Set up bedroom basics"],
    includes: ["Deep clean of kitchen and bathroom", "Kitchen essentials unpacked", "Bedroom set up for the first night", "Boxes broken down and cleared"],
    helperIds: homeHelpers,
  },
  "Weekly meal preparation": {
    title: "Weekly meal preparation",
    category: "food",
    tagline: "A week of home-cooked meals, prepared in your own kitchen.",
    hours: 3,
    price: 168,
    tasks: ["Plan the weekly menu", "Cook and portion meals", "Reset the kitchen"],
    includes: ["Menu planned around your tastes", "Meals cooked and portioned", "Labeled storage in your fridge", "Kitchen left clean"],
    helperIds: ["maria", "elena", "nora", "nina"],
  },
  "Home-cooked meals": {
    title: "Home-cooked meals",
    category: "food",
    tagline: "A fresh dinner made at home for family or friends.",
    hours: 2.5,
    price: 142,
    tasks: ["Prepare a home-cooked dinner", "Set the table", "Clean up the kitchen"],
    includes: ["Custom dinner menu", "Cooking in your kitchen", "Table set and ready", "Full kitchen cleanup"],
    helperIds: ["maria", "sofia", "nina"],
  },
  "Fridge restocking": {
    title: "Fridge restocking",
    category: "food",
    tagline: "Groceries bought, put away, and easy to find.",
    hours: 2,
    price: 96,
    tasks: ["Shop from your grocery list", "Clear out expired items", "Organize the fridge"],
    includes: ["Shopping from your list", "Expired items removed", "Shelves wiped down", "Everything organized by use"],
    helperIds: ["elena", "maria", "nora"],
  },
  "Kitchen organization": {
    title: "Kitchen organization",
    category: "food",
    tagline: "Cabinets and pantry arranged around how you actually cook.",
    hours: 3,
    price: 178,
    tasks: ["Sort cabinets and pantry", "Group everyday items", "Label storage"],
    includes: ["Cabinets and pantry sorted", "Everyday items within reach", "Clear labels and containers", "Donation pile removed"],
    helperIds: ["jasmine", "maria"],
    option: suppliesOption,
  },
  Alterations: {
    title: "Alterations",
    category: "clothing",
    tagline: "Clothes adjusted so they fit the way they should.",
    hours: 1,
    price: 58,
    tasks: ["Fit and pin garments", "Hem or adjust the fit"],
    includes: ["In-person fitting", "Hemming and resizing", "Small repairs included", "Pressed before return"],
    helperIds: ["clara"],
  },
  Tailoring: {
    title: "Tailoring",
    category: "clothing",
    tagline: "Detailed tailoring for suits, dresses, and special pieces.",
    hours: 1.5,
    price: 92,
    tasks: ["Take measurements", "Tailor the garment", "Final fitting"],
    includes: ["Full measurements", "Custom adjustments", "Formalwear experience", "Final fitting"],
    helperIds: ["clara"],
  },
  "Pickup and return": {
    title: "Pickup and return",
    category: "clothing",
    tagline: "Clothing care collected from your door and brought back.",
    hours: 1,
    price: 44,
    tasks: ["Pick up garments", "Return finished garments"],
    includes: ["Pickup from your home", "Careful garment handling", "Return at a time you choose", "Updates along the way"],
    helperIds: ["clara", "jasmine"],
  },
  "Wardrobe organization": {
    title: "Wardrobe organization",
    category: "clothing",
    tagline: "A closet that is easy to use and easy to keep tidy.",
    hours: 3,
    price: 186,
    tasks: ["Sort your wardrobe", "Organize by category", "Set aside donations"],
    includes: ["Full wardrobe sort", "Organized by category and season", "Donation items set aside", "Tips to keep it tidy"],
    helperIds: ["jasmine", "clara"],
    option: suppliesOption,
  },
  Styling: {
    title: "Styling",
    category: "personal",
    tagline: "Personal styling at home, using the wardrobe you already own.",
    hours: 1.5,
    price: 120,
    tasks: ["Review your wardrobe", "Build outfits for your plans"],
    includes: ["Wardrobe review", "Outfits for your occasions", "Photo notes of each look", "Short list of gaps to fill"],
    helperIds: ["selin", "dara"],
  },
  "Eyebrow threading": {
    title: "Eyebrow threading",
    category: "personal",
    tagline: "Clean, precise brows without leaving home.",
    hours: 0.5,
    price: 32,
    tasks: ["Shape and thread eyebrows"],
    includes: ["Brow shape consultation", "Precise threading", "Soothing aftercare", "All tools sanitized"],
    helperIds: ["dara", "selin"],
  },
  "At-home beauty services": {
    title: "At-home beauty services",
    category: "personal",
    tagline: "Relaxed beauty appointments in the comfort of your home.",
    hours: 1.5,
    price: 110,
    tasks: ["Beauty consultation", "At-home beauty appointment"],
    includes: ["Consultation before you start", "Professional products brought to you", "Treatment suited to your skin", "Space left as it was found"],
    helperIds: ["selin", "dara"],
  },
}

const primaryServiceByHelper: Record<string, string> = {
  maria: "Home-cooked meals",
  jasmine: "Kitchen organization",
  priya: "Weekly reset",
  tomas: "Move-in reset",
  mei: "Alterations",
  clara: "Alterations",
  nora: "Weekly meal preparation",
  elena: "Weekly meal preparation",
  sofia: "Home-cooked meals",
  nina: "Weekly meal preparation",
  selin: "Styling",
  dara: "Eyebrow threading",
}

type PlanTemplate = {
  title: string
  badge: string
  description: string
  schedule: string
  helpers: number
  hoursFactor: number
  priceFactor: number
}

const planTemplates: Record<ServiceCategory, Record<PlanId, PlanTemplate>> = {
  home: {
    solo: { title: "One helper", badge: "Recommended", description: "One helper takes care of everything.", schedule: "The simplest option with one arrival.", helpers: 1, hoursFactor: 1, priceFactor: 1 },
    team: { title: "Team of two", badge: "", description: "Two helpers finish your home faster.", schedule: "Done in less time.", helpers: 2, hoursFactor: 0.6, priceFactor: 1.3 },
    split: { title: "Two shorter visits", badge: "", description: "The same work split across two days.", schedule: "Less time at home each day.", helpers: 1, hoursFactor: 1, priceFactor: 1.12 },
  },
  food: {
    solo: { title: "One helper", badge: "Recommended", description: "One helper handles it from start to finish.", schedule: "The simplest option with one arrival.", helpers: 1, hoursFactor: 1, priceFactor: 1 },
    team: { title: "Helper and assistant", badge: "", description: "A second person speeds up prep and cleanup.", schedule: "Done in less time.", helpers: 2, hoursFactor: 0.6, priceFactor: 1.3 },
    split: { title: "Two shorter visits", badge: "", description: "Fresher results across two visits.", schedule: "Spread across the week.", helpers: 1, hoursFactor: 1, priceFactor: 1.12 },
  },
  clothing: {
    solo: { title: "Standard", badge: "Recommended", description: "Finished at the regular pace.", schedule: "Ready in about 5 days.", helpers: 1, hoursFactor: 1, priceFactor: 1 },
    team: { title: "Express", badge: "", description: "Priority handling for tight deadlines.", schedule: "Ready in about 48 hours.", helpers: 1, hoursFactor: 1, priceFactor: 1.4 },
    split: { title: "With a follow-up", badge: "", description: "Includes a second visit to check the result.", schedule: "Second visit within 7 days.", helpers: 1, hoursFactor: 1.5, priceFactor: 1.25 },
  },
  personal: {
    solo: { title: "Single visit", badge: "Recommended", description: "One appointment at your home.", schedule: "Everything is brought to you.", helpers: 1, hoursFactor: 1, priceFactor: 1 },
    team: { title: "Extended visit", badge: "", description: "More time for extra requests.", schedule: "A slower, more detailed session.", helpers: 1, hoursFactor: 1.5, priceFactor: 1.4 },
    split: { title: "Two-visit package", badge: "", description: "Book two visits together and save.", schedule: "Second visit in about 4 weeks.", helpers: 1, hoursFactor: 2, priceFactor: 1.8 },
  },
}

type ServicePlan = {
  title: string
  badge: string
  description: string
  people: string
  duration: string
  schedule: string
  total: string
  hours: number
  helperCount: number
  roles?: string[]
  photoKey?: string
  fee?: number
  lines?: Array<{ label: string; amount: number }>
  structure?: string
  tradeoffParts?: string[]
  durationLabel?: string
}

function clockParts(value: number) {
  const totalMinutes = Math.round(value * 60)
  const hour = Math.floor(totalMinutes / 60) % 24
  const minute = totalMinutes % 60
  return {
    label: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`,
    period: hour >= 12 ? "PM" : "AM",
  }
}

function formatRange(start: number, hours: number) {
  const from = clockParts(start)
  const to = clockParts(start + hours)
  return from.period === to.period
    ? `${from.label}–${to.label} ${to.period}`
    : `${from.label} ${from.period}–${to.label} ${to.period}`
}

function parseRangeStart(range: string) {
  const match = range.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?.*?(AM|PM)$/)
  if (!match) return null
  const period = match[3] ?? match[4]
  return (Number(match[1]) % 12) + (period === "PM" ? 12 : 0) + Number(match[2]) / 60
}

function hoursLabel(hours: number) {
  if (hours < 1) return `About ${Math.round(hours * 60)} min`
  return `About ${hours} hour${hours === 1 ? "" : "s"}`
}

function weekdayOf(date: string) {
  return date.split(",")[0] || "Saturday"
}

function photoAt(title: string, width: number) {
  return servicePhotos[title].replace("w=320", `w=${width}`)
}

function serviceOption(service: ServiceInfo) {
  return service.option ?? categoryOptions[service.category]
}

type PlanIssue = {
  helperId: string
  hours: number
  weekday: string
  nextDate: string | null
}

type PlanState = {
  issue: PlanIssue | null
  tag: string
  note: string
}

const PLAN_IDS: PlanId[] = ["solo", "team", "split"]

function dateFromLabel(label: string) {
  return new Date(`${label.split(", ")[1]}, 2026`)
}

function mediumDateFromLabel(label: string) {
  const iso = isoFromLongDate(label)
  return iso ? mediumDate(iso) : label
}

function shortDate(label: string) {
  if (!isoFromLongDate(label)) return label
  const [weekday, rest = ""] = label.split(", ")
  const [month = "", day = ""] = rest.split(" ")
  return `${weekday.slice(0, 3)}, ${month.slice(0, 3)} ${day}`
}

function helperFits(id: string, day: Date, start: number | null, hours: number) {
  const helper = providerById(id)
  const hoursOpen = helper ? workingHoursOn(helper, toIso(day)) : null
  if (!hoursOpen) return false
  const [open, close] = hoursOpen
  return start === null ? close - open >= hours : start >= open && start + hours <= close
}

function findPlanIssue(
  team: string[],
  date: string,
  time: string,
  hours: number,
): PlanIssue | null {
  const day = dateFromLabel(date)
  if (Number.isNaN(day.getTime())) return null
  const start = parseRangeStart(time)
  const helperId = team.find((id) => !helperFits(id, day, start, hours))
  if (!helperId) return null
  let nextDate: string | null = null
  for (let offset = 1; offset <= 21 && !nextDate; offset += 1) {
    const candidate = new Date(day)
    candidate.setDate(day.getDate() + offset)
    if (team.every((id) => helperFits(id, candidate, start, hours))) {
      nextDate = candidate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    }
  }
  return { helperId, hours, weekday: weekdayOf(date), nextDate }
}

function issueDetail(issue: PlanIssue) {
  const name = providerName(issue.helperId).split(" ")[0]
  return `${name} isn’t free for ${issue.hours} ${
    issue.hours === 1 ? "hour" : "hours"
  } at this time.`
}

function PlanIssueNotice({
  issue,
  onMove,
}: {
  issue: PlanIssue
  onMove?: () => void
}) {
  return (
    <div className="plan-issue" role="status">
      <strong>Not available {issue.weekday}</strong>
      <small>
        {issueDetail(issue)}{" "}
        {issue.nextDate
          ? `Earliest is ${shortDate(issue.nextDate)}.`
          : "Try another helper."}
      </small>
      {onMove && issue.nextDate && (
        <button onClick={onMove} type="button">
          Move to {shortDate(issue.nextDate)}
        </button>
      )}
    </div>
  )
}

function planStates(
  plans: Record<PlanId, ServicePlan>,
  teamFor: (plan: PlanId) => string[],
  date: string,
  time: string,
): Record<PlanId, PlanState> {
  const price = (id: PlanId) => Number(plans[id].total.replace(/\D/g, ""))
  const issues = Object.fromEntries(
    PLAN_IDS.map((id) => [id, findPlanIssue(teamFor(id), date, time, plans[id].hours)]),
  ) as Record<PlanId, PlanIssue | null>
  const open = PLAN_IDS.filter((id) => !issues[id])
  const recommended = [...open].sort((a, b) => price(a) - price(b))[0]
  const fastest = recommended
    ? open.find(
        (id) =>
          id !== recommended &&
          plans[id].hours < plans[recommended].hours &&
          open.every((other) => plans[id].hours <= plans[other].hours),
      )
    : undefined
  const cheaperBlocked = recommended
    ? PLAN_IDS.find((id) => issues[id] && price(id) < price(recommended))
    : undefined
  return Object.fromEntries(
    PLAN_IDS.map((id) => [
      id,
      {
        issue: issues[id],
        tag: id === recommended ? "Recommended" : id === fastest ? "Fastest" : "",
        note:
          id === recommended && cheaperBlocked
            ? `${plans[cheaperBlocked].title} isn’t available ${weekdayOf(date)}. This plan fits your time.`
            : plans[id].description,
      },
    ]),
  ) as Record<PlanId, PlanState>
}

function orderedHelpers(service: ServiceInfo, selected: string) {
  return service.helperIds.includes(selected)
    ? [selected, ...service.helperIds.filter((id) => id !== selected)]
    : service.helperIds
}

function generatedPlanStates(
  plans: GeneratedPlan[],
  request: ServiceRequest,
): Partial<Record<PlanId, PlanState>> {
  const best = plans.find((plan) => plan.isBest)
  const cheaperBlocked =
    best &&
    plans.find(
      (plan) => plan.availability.status === "later" && plan.price.total < best.price.total,
    )
  const label = blockedLabel(request.datePreference)
  const issueFor = (plan: GeneratedPlan): PlanIssue | null => {
    const { availability } = plan
    if (availability.status !== "later") return null
    return {
      helperId: availability.helperId,
      hours:
        plan.assignments.find((item) => item.helperId === availability.helperId)?.hours ??
        plan.hours,
      weekday: label,
      nextDate: availability.nextDate ? longDate(availability.nextDate) : null,
    }
  }
  return Object.fromEntries(
    plans.map((plan) => [
      plan.id,
      {
        issue: issueFor(plan),
        tag: plan.isBest ? "Recommended" : plan.isFastest ? "Fastest" : "",
        note: plan.isBest
          ? cheaperBlocked
            ? `${cheaperBlocked.title} isn’t available ${label}. This plan fits your time.`
            : "Best combination for your tasks, schedule, and location."
          : plan.description,
      },
    ]),
  )
}

function toServicePlan(plan: GeneratedPlan, request: ServiceRequest, index: number): ServicePlan {
  const lead = request.tasks[index] ?? request.tasks[0]
  return {
    title: plan.title,
    badge: "",
    description: plan.description,
    people: plan.helperIds.length === 1 ? "1 helper" : `${plan.helperIds.length} helpers`,
    duration: "",
    schedule: "",
    total: `$${plan.price.total} total`,
    hours: plan.hours,
    helperCount: plan.helperIds.length,
    roles: plan.assignments.map((item) => item.role),
    photoKey: lead ? serviceCatalog[lead.category].photoKey : undefined,
    fee: plan.price.fee,
    lines: [
      ...plan.price.lines,
      ...plan.price.extras,
      { label: "Service fee", amount: plan.price.fee },
    ],
    structure:
      plan.helperIds.length === 1
        ? "One visit"
        : plan.concurrent
          ? "Working at the same time"
          : "Separate appointments",
    tradeoffParts: plan.tradeoffParts,
    durationLabel: plan.visits > 1 ? `${plan.hours} hours, ${plan.visits} visits` : undefined,
  }
}

function getServicePlans(service: ServiceInfo, date: string, time: string) {
  const start = parseRangeStart(time)
  const build = (id: PlanId): ServicePlan => {
    const template = planTemplates[service.category][id]
    const hours = Math.max(0.5, Math.round(service.hours * template.hoursFactor * 2) / 2)
    return {
      title: template.title,
      badge: template.badge,
      description: template.description,
      people: template.helpers === 1 ? "1 helper" : `${template.helpers} helpers`,
      duration: `${weekdayOf(date)}, ${start === null ? time : formatRange(start, hours)}`,
      schedule: template.schedule,
      total: `$${Math.round(service.price * template.priceFactor)} total`,
      hours,
      helperCount: Math.min(template.helpers, service.helperIds.length),
    }
  }
  return { solo: build("solo"), team: build("team"), split: build("split") }
}

function providerName(id: string) {
  return providers.find((item) => item.id === id)?.name ?? "Helper"
}

type Booking = {
  id: string
  title: string
  subtitle: string
  photo: string
  date: string
  time: string
  hours?: number
  address: string
  access: string
  tasks: string[]
  countLabel?: string
  helperIds: string[]
  total: string
  planTitle: string
  paymentMethod: string
  reference: string
  status: "upcoming" | "cancelled"
  statusLabel: string
  homeLabel?: string
  serviceTitle?: string
  calendarAdded?: boolean
  /** Last allowed day (ISO) when no single date has been chosen. */
  dateWindowEnd?: string
  serviceFee?: number
}

const initialBookings: Booking[] = [
  {
    id: "tailoring",
    title: "Tailoring Service",
    subtitle: "Alterations",
    photo: servicePhotos["Tailoring Service"],
    date: "Thursday, October 22",
    time: "4:00 PM",
    address: selectedAddressLabel,
    access: "Arrange later",
    tasks: ["Dress alterations", "Pants hemming"],
    countLabel: "2 garments",
    helperIds: ["clara"],
    total: "$58",
    planTitle: "Standard",
    paymentMethod: "Apple Pay",
    reference: "SP-1022-058",
    status: "upcoming",
    statusLabel: "In 2 days",
    homeLabel: "In 13 hours",
    serviceTitle: "Tailoring",
  },
]

const categoryPrep: Record<ServiceCategory, string> = {
  home: "Put away valuables and mention any pets.",
  food: "Share allergies and clear some counter space.",
  clothing: "Have your garments clean and ready.",
  personal: "Choose a well-lit spot and mention any allergies.",
}

function bookingStartsAt(booking: Booking) {
  const iso = booking.dateWindowEnd ?? isoFromLongDate(booking.date) ?? TODAY
  const day = fromIso(iso).getTime()
  // A flexible time has no start yet, so it sorts last within its day.
  const hour = booking.dateWindowEnd ? 24 : (parseRangeStart(booking.time) ?? 24)
  return day + hour * 3600000
}

function bookingHasConfirmedTime(booking: Booking) {
  return !booking.dateWindowEnd && parseRangeStart(booking.time) !== null
}

function bookingWhen(booking: Booking) {
  return booking.dateWindowEnd || !isoFromLongDate(booking.date)
    ? `${booking.date} · ${booking.time}`
    : `${weekdayOf(booking.date)}, ${booking.time}`
}

function nearestFirst(bookings: Booking[]) {
  return [...bookings].sort((a, b) => bookingStartsAt(a) - bookingStartsAt(b))
}

function bookingHours(booking: Booking) {
  return (
    booking.hours ??
    (booking.serviceTitle ? services[booking.serviceTitle]?.hours : undefined) ??
    3.5
  )
}

function bookingCategory(booking: Booking): ServiceCategory {
  return booking.serviceTitle
    ? (services[booking.serviceTitle]?.category ?? "home")
    : "home"
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function calendarStamp(value: Date) {
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}T${pad(value.getHours())}${pad(value.getMinutes())}00`
}

function calendarDay(value: Date) {
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}`
}

function calendarEvent(booking: Booking) {
  const day = new Date(`${booking.date.split(", ")[1]}, 2026`)
  const startHour = parseRangeStart(booking.time)
  const names = booking.helperIds.map(providerName).join(" & ")
  const allDay = startHour === null
  const start = allDay
    ? day
    : new Date(day.getTime() + startHour * 3600000)
  const end = allDay
    ? new Date(day.getTime() + 86400000)
    : new Date(start.getTime() + bookingHours(booking) * 3600000)
  return {
    title: `${booking.title} with ${names}`,
    details: `${booking.tasks.join(", ")}. Reference ${booking.reference}.`,
    location: booking.address,
    allDay,
    start: allDay ? calendarDay(start) : calendarStamp(start),
    end: allDay ? calendarDay(end) : calendarStamp(end),
  }
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1")
}

function downloadCalendarFile(booking: Booking) {
  const event = calendarEvent(booking)
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")
  const dateType = event.allDay ? ";VALUE=DATE" : ""
  const contents = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Booking Flow//Prototype//EN",
    "BEGIN:VEVENT",
    `UID:${booking.reference}@booking-flow`,
    `DTSTAMP:${stamp}`,
    `DTSTART${dateType}:${event.start}`,
    `DTEND${dateType}:${event.end}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `LOCATION:${escapeCalendarText(event.location)}`,
    `DESCRIPTION:${escapeCalendarText(event.details)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n")
  const url = URL.createObjectURL(new Blob([contents], { type: "text/calendar" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `${booking.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function googleCalendarUrl(booking: Booking) {
  const event = calendarEvent(booking)
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${event.start}/${event.end}`,
    location: event.location,
    details: event.details,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const planOptions: Array<{
  id: PlanId
  label?: string
  title: string
  details: string[]
  description: string
}> = [
  {
    id: "solo",
    label: "Recommended",
    title: "One Helper",
    details: ["1 person", "About 6 hours", "Saturday", "$240–$290"],
    description: "One person completes all three tasks.",
  },
  {
    id: "team",
    title: "Two-Person Team",
    details: ["2 specialists", "About 4 hours", "Saturday", "$310–$360"],
    description: "Cooking and organization happen at the same time.",
  },
  {
    id: "split",
    title: "Split Across Two Days",
    details: ["2 helpers", "About 4 hours", "Friday and Saturday", "$270–$320"],
    description: "Organization is completed before the event day.",
  },
]

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    hanger: (
      <path d="M12 8.5V8c0-1.2 2-1.6 2-3.2A2 2 0 0 0 10 4.8M12 8.5l-8.6 7.2a1 1 0 0 0 .64 1.8h15.92a1 1 0 0 0 .64-1.8L12 8.5Z" />
    ),
    pot: (
      <>
        <path d="M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6ZM3 10h2M19 10h2" />
        <path d="M9.5 6.5c0-1 1-1 1-2M13.5 6.5c0-1 1-1 1-2" />
      </>
    ),
    scissors: (
      <>
        <circle cx="6" cy="6.5" r="2.5" />
        <circle cx="6" cy="17.5" r="2.5" />
        <path d="M8 8.2 20 18M8 15.8 20 6" />
      </>
    ),
    washer: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <circle cx="12" cy="13" r="4" />
        <path d="M7.5 6.5h.01M10.5 6.5h.01" />
      </>
    ),
    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </>
    ),
    "arrow-left": <path d="m15 18-6-6 6-6" />,
    "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h3l1.5-2h7L17 7h3v12H4Z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    card: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M7 15h3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    explore: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2 5-5 2 2-5Z" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </>
    ),
    message: (
      <>
        <path d="M4 5h16v11H9l-5 4Z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
      </>
    ),
    minus: <path d="M5 12h14" />,
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    saved: <path d="M6 3h12v18l-6-4-6 4Z" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4Z" />
        <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7Z" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4M8 8l4-4 4 4" />
        <path d="M4 15v5h16v-5" />
      </>
    ),
    x: <path d="m6 6 12 12M18 6 6 18" />,
  }

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  )
}

function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  ariaLabel,
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "text" | "icon"
  className?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`button button--${variant} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {variant === "primary" ? (
        <>
          <span className="button-label">{children}</span>
          <span aria-hidden="true" className="button-arrow">
            <Icon name="arrow-up-right" size={14} />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

function Header({
  title,
  subtitle,
  onBack,
}: {
  title: string
  subtitle?: string
  onBack: () => void
}) {
  return (
    <header className="screen-header">
      <Button ariaLabel="Go back" onClick={onBack} variant="icon">
        <Icon name="arrow-left" />
      </Button>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  )
}

function StatusBar() {
  return (
    <div className="status-bar" aria-label="9:41, cellular, Wi-Fi, battery">
      <span>9:41</span>
      <span className="status-icons" aria-hidden="true">
        <span className="cellular">▮▮▮▮</span>
        <svg className="wifi" viewBox="0 0 20 14">
          <path d="M1 4.5C6-1 14-1 19 4.5M4 8c3.5-3.5 8.5-3.5 12 0M8 11.5c1.2-1.1 2.8-1.1 4 0" />
        </svg>
        <span className="battery">
          <span />
        </span>
      </span>
    </div>
  )
}

function HomeIndicator() {
  return <div className="home-indicator" aria-hidden="true" />
}

function MainNavigation({
  active,
  onNavigate,
  taskNotice = false,
}: {
  active: NavPage
  onNavigate: (page: NavPage) => void
  taskNotice?: boolean
}) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {[
        ["home", "Home", "home"],
        ...(EXPLORE_ENABLED ? [["explore", "Explore", "explore"]] : []),
        ["list", "Tasks", "tasks"],
        ["saved", "Saved", "saved"],
      ].map(([icon, label, page]) => (
        <button
          className={active === page ? "active" : ""}
          key={page}
          onClick={() => onNavigate(page as NavPage)}
          type="button"
        >
          <span className="nav-icon">
            <Icon name={icon as IconName} />
            {taskNotice && page === "tasks" && (
              <span className="notification-dot" />
            )}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function BookmarkButton({
  saved,
  onClick,
}: {
  saved: boolean
  onClick: () => void
}) {
  return (
    <Button
      ariaLabel={saved ? "Remove from saved" : "Save provider"}
      className={`bookmark-button ${saved ? "saved" : ""}`}
      onClick={onClick}
      variant="icon"
    >
      <Icon name="saved" />
    </Button>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <div className="progress-block" aria-label={`Step ${step} of 5`}>
      <span>Step {step} of 5</span>
      <div className="progress-track">
        <span className={`progress-value progress-value--${step}`} />
      </div>
    </div>
  )
}

function BookingContext({
  date,
  time,
  address,
}: {
  date: string
  time: string
  address: string
}) {
  return (
    <div className="booking-context">
      <span>
        <Icon name="calendar" size={15} /> {date || "Date not selected"}
      </span>
      <span>
        <Icon name="clock" size={15} /> {time || "Time not selected"}
      </span>
      <span>
        <Icon name="pin" size={15} /> {address || "Address not selected"}
      </span>
    </div>
  )
}

function BottomAction({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <div className="bottom-action">
      <Button onClick={onClick}>{children}</Button>
    </div>
  )
}

const EXPLORE_FILTERS = [
  { id: "all", label: "All" },
  { id: "cleaning", label: "Cleaning" },
  { id: "meal-prep", label: "Cooking" },
  { id: "organization", label: "Organizing" },
  { id: "laundry", label: "Laundry" },
  { id: "tailoring", label: "Tailoring" },
  { id: "personal-care", label: "Beauty" },
] as const

type ExploreFilter = (typeof EXPLORE_FILTERS)[number]["id"]

/** Helpers who are strong at the chosen kind of work, best first. */
function exploreHelpers(filter: ExploreFilter) {
  const byRating = (a: (typeof providers)[number], b: (typeof providers)[number]) =>
    Number(b.rating) - Number(a.rating) || b.completed - a.completed
  if (filter === "all") return [...providers].sort(byRating)
  return providers
    .filter((helper) => (helper.capabilities[filter] ?? 0) >= 0.85)
    .sort((a, b) => (b.capabilities[filter] ?? 0) - (a.capabilities[filter] ?? 0) || byRating(a, b))
}

function HomeScreen({
  requestText,
  setRequestText,
  submitRequest,
  searchLoading,
  openProfile,
  openUpcomingTask,
  upcoming,
  openProvider,
  onNavigate,
  taskNotice,
  savedProviders,
  toggleSaved,
}: {
  savedProviders: string[]
  toggleSaved: (id: string) => void
  upcoming: Booking | null
  requestText: string
  setRequestText: (value: string) => void
  submitRequest: () => void
  searchLoading: boolean
  openProfile: () => void
  openUpcomingTask: () => void
  openProvider: (id: string) => void
  onNavigate: (page: NavPage) => void
  taskNotice: boolean
}) {
  const examples = [
    "Get my apartment ready for guests on Saturday.",
    "Where can I get my dress altered by Friday?",
    "I need weekly meal prep every Wednesday.",
    "Organize my closet while I’m at work.",
  ]
  const [exampleIndex, setExampleIndex] = useState(0)
  const [listening, setListening] = useState(false)
  const [exploreFilter, setExploreFilter] = useState<ExploreFilter>("all")
  useEffect(() => {
    const timer = window.setInterval(
      () => setExampleIndex((current) => (current + 1) % examples.length),
      2800,
    )
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="screen home-screen">
      <main className="screen-scroll home-content">
        <div className="location-row">
          <div className="location">
            <Icon name="pin" size={18} />
            <span>New York City</span>
          </div>
          <Button ariaLabel="Open profile" onClick={openProfile} variant="icon">
            <Icon name="profile" />
          </Button>
        </div>

        <section className="home-request">
          <h1>What do you need help with?</h1>
          <form
            className={`home-request-composer ${
              requestText.trim() ? "has-value" : ""
            } ${listening ? "listening" : ""}`}
            onSubmit={(event) => {
              event.preventDefault()
              if (requestText.trim() && !searchLoading) submitRequest()
            }}
          >
            <textarea
              aria-label="Describe what you need help with"
              disabled={searchLoading}
              onChange={(event) => setRequestText(event.target.value)}
              placeholder={examples[exampleIndex]}
              rows={3}
              value={requestText}
            />
            <div className="composer-actions">
              <Button
                ariaLabel={listening ? "Stop listening" : "Start voice input"}
                className={listening ? "listening" : ""}
                onClick={() => setListening((current) => !current)}
                variant="text"
              >
                <Icon name="mic" size={21} />
              </Button>
              <Button
                disabled={!requestText.trim() || searchLoading}
                onClick={submitRequest}
              >
                Continue
              </Button>
            </div>
          </form>
          {searchLoading && (
            <div className="search-loading" role="status">
              <span />
              Preparing your request…
            </div>
          )}
        </section>
        {upcoming && (
          <section className="home-upcoming warm-home-upcoming">
            <div className="section-title-row">
              <h2>Upcoming</h2>
            </div>
            <article
              className="warm-upcoming-card"
              onClick={(event) => {
                if (!(event.target as HTMLElement).closest("button")) {
                  openUpcomingTask()
                }
              }}
            >
              <img
                alt={upcoming.title}
                className="service-thumbnail"
                src={upcoming.photo}
              />
              <div>
                <small>{upcoming.homeLabel ?? upcoming.statusLabel}</small>
                <strong>{upcoming.title}</strong>
                <span>
                  {weekdayOf(upcoming.date)} · {upcoming.time}
                </span>
                <button
                  onClick={() => openProvider(upcoming.helperIds[0])}
                  type="button"
                >
                  <img alt="" src={helperPhotos[upcoming.helperIds[0]]} />
                  {providerName(upcoming.helperIds[0])}
                </button>
              </div>
              <Button onClick={openUpcomingTask} variant="text">
                View details →
              </Button>
            </article>
          </section>
        )}
        <section className="home-explore" aria-label="Explore helpers">
          <div className="home-explore-head">
            <h2>Explore helpers</h2>
            <p>Save the ones you like for later.</p>
          </div>
          <div className="home-explore-filters" role="tablist" aria-label="Filter helpers by category">
            {EXPLORE_FILTERS.map((filter) => (
              <button
                aria-selected={exploreFilter === filter.id}
                className={exploreFilter === filter.id ? "is-active" : ""}
                key={filter.id}
                onClick={(event) => {
                  setExploreFilter(filter.id)
                  event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
                }}
                role="tab"
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="home-explore-row" key={exploreFilter}>
            {exploreHelpers(exploreFilter).map((helper) => {
                const saved = savedProviders.includes(helper.id)
                return (
                  <article className="explore-helper" key={helper.id}>
                    <button
                      aria-label={`View ${helper.name} profile`}
                      className="explore-helper-open"
                      onClick={() => openProvider(helper.id)}
                      type="button"
                    >
                      <img alt="" src={helperPhotos[helper.id]} />
                      <strong>{helper.name}</strong>
                      <small>
                        ★ {helper.rating} · {helper.service}
                      </small>
                    </button>
                    <button
                      aria-label={saved ? `Remove ${helper.name} from saved` : `Save ${helper.name}`}
                      aria-pressed={saved}
                      className={`explore-helper-save ${saved ? "is-saved" : ""}`}
                      onClick={() => toggleSaved(helper.id)}
                      type="button"
                    >
                      <Icon name="saved" size={16} />
                    </button>
                  </article>
                )
              })}
          </div>
        </section>
      </main>

      <MainNavigation
        active="home"
        onNavigate={onNavigate}
        taskNotice={taskNotice}
      />
    </div>
  )
}

function AllHelpersScreen({
  back,
  scope,
  initialQuery,
  openProvider,
  book,
}: {
  back: () => void
  scope: ServiceInfo | null
  initialQuery: string
  openProvider: (id: string) => void
  book: (id: string) => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<ServiceCategory | "all">("all")
  const term = query.trim().toLowerCase()
  const visible = providers
    .filter(
      (item) =>
        (!term || helperMatches(item.id, term)) &&
        (category === "all" || helperCategories(item.id).includes(category)),
    )
    .sort(
      (a, b) =>
        Number(b.rating) - Number(a.rating) || b.completed - a.completed,
    )
  const offering = scope
    ? visible.filter((item) => scope.helperIds.includes(item.id))
    : visible
  const others = scope
    ? visible.filter((item) => !scope.helperIds.includes(item.id))
    : []
  const renderRows = (items: typeof providers) => (
    <div className="helper-browse-list">
      {items.map((item) => (
        <div className="helper-browse-row" key={item.id}>
          <button
            aria-label={`View ${item.name} profile`}
            onClick={() => openProvider(item.id)}
            type="button"
          >
            <img alt="" src={helperPhotos[item.id]} />
            <span>
              <strong>{item.name}</strong>
              <small>
                ★ {item.rating} · {item.completed} tasks
              </small>
              <small>
                {item.service} · {item.availability.replace("Available ", "")}
              </small>
            </span>
          </button>
          <Button onClick={() => book(item.id)} variant="secondary">
            Book
          </Button>
        </div>
      ))}
    </div>
  )
  return (
    <div className="screen booking-flow-screen">
      <FlowHeader
        back={back}
        step={scope ? scope.title : "Book directly"}
        title="All helpers"
      />
      <main className="screen-scroll helpers-content">
        <label className="explore-search">
          <Icon name="search" size={18} />
          <input
            aria-label="Search helpers"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or skill"
            value={query}
          />
        </label>
        <div className="helper-filter">
          {(["all", ...Object.keys(categoryLabels)] as Array<
            ServiceCategory | "all"
          >).map((item) => (
            <button
              className={category === item ? "selected" : ""}
              key={item}
              onClick={() => setCategory(item)}
              type="button"
            >
              {item === "all" ? "All" : categoryLabels[item]}
            </button>
          ))}
        </div>
        {scope && offering.length > 0 && <h2>Offer {scope.title}</h2>}
        {renderRows(offering)}
        {others.length > 0 && <h2>Other helpers</h2>}
        {others.length > 0 && renderRows(others)}
        {visible.length === 0 && (
          <EmptyState
            action="Clear search"
            onAction={() => {
              setQuery("")
              setCategory("all")
            }}
            text="Try another name or skill."
            title="No helpers found"
          />
        )}
      </main>
    </div>
  )
}

function helperMatches(id: string, term: string) {
  const provider = providers.find((item) => item.id === id)!
  return [provider.name, provider.service, ...provider.skills].some((text) =>
    text.toLowerCase().includes(term),
  )
}

function helperCategories(id: string) {
  return Object.values(services)
    .filter((service) => service.helperIds.includes(id))
    .map((service) => service.category)
}

function HelperRows({
  ids,
  openProvider,
}: {
  ids: string[]
  openProvider: (id: string) => void
}) {
  return (
    <div className="service-helper-list">
      {ids.map((id) => {
        const provider = providers.find((item) => item.id === id)!
        return (
          <button key={id} onClick={() => openProvider(id)} type="button">
            <img alt={provider.name} src={helperPhotos[id]} />
            <span>
              <strong>{provider.name}</strong>
              <small>
                ★ {provider.rating} · {provider.completed} tasks
              </small>
            </span>
            <Icon name="chevron" size={15} />
          </button>
        )
      })}
    </div>
  )
}

function ExploreScreen({
  onNavigate,
  chooseService,
  query,
  setQuery,
  openProvider,
  seeAllHelpers,
}: {
  onNavigate: (page: NavPage) => void
  chooseService: (service: string) => void
  query: string
  setQuery: (query: string) => void
  openProvider: (id: string) => void
  seeAllHelpers: (query: string) => void
}) {
  const term = query.trim().toLowerCase()
  const visibleGroups = exploreGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !term ||
          item.toLowerCase().includes(term) ||
          group.title.toLowerCase().includes(term) ||
          services[item].tagline.toLowerCase().includes(term),
      ),
    }))
    .filter((group) => group.items.length > 0)
  const matchingHelpers = term
    ? providers.filter((item) => helperMatches(item.id, term)).map((item) => item.id)
    : []
  return (
    <div className="screen main-page explore-page">
      <main className="screen-scroll explore-content">
        <PageHeader title="Explore services" />
        <label className="explore-search">
          <Icon name="search" size={18} />
          <input
            aria-label="Search services and helpers"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search services or helpers"
            value={query}
          />
        </label>
        {EXPLORE_ENABLED && !term && (
          <button
            className="explore-helpers-link"
            onClick={() => seeAllHelpers("")}
            type="button"
          >
            <span>
              {["maria", "jasmine", "clara"].map((id) => (
                <img alt="" key={id} src={helperPhotos[id]} />
              ))}
            </span>
            <strong>Browse all helpers</strong>
            <Icon name="chevron" size={14} />
          </button>
        )}
        {matchingHelpers.length > 0 && (
          <section className="explore-group">
            <div className="helper-section-head">
              <h2>Helpers</h2>
              {EXPLORE_ENABLED && matchingHelpers.length > 3 && (
                <button onClick={() => seeAllHelpers(query)} type="button">
                  See all
                </button>
              )}
            </div>
            <HelperRows
              ids={matchingHelpers.slice(0, 3)}
              openProvider={openProvider}
            />
          </section>
        )}
        {visibleGroups.map((group) => (
          <section className="explore-group" key={group.title}>
            <h2>{group.title}</h2>
            <div className="explore-grid">
              {group.items.map((item) => (
                <button
                  className={`explore-service ${group.tone}`}
                  key={item}
                  onClick={() => chooseService(item)}
                  type="button"
                >
                  <img alt="" src={servicePhotos[item]} />
                  <strong>{item}</strong>
                  <Icon name="chevron" size={13} />
                </button>
              ))}
            </div>
          </section>
        ))}
        {visibleGroups.length === 0 && matchingHelpers.length === 0 && (
          <EmptyState
            action="Clear search"
            onAction={() => setQuery("")}
            text="Try another word, such as cooking, closet, or beauty."
            title="No results found"
          />
        )}
      </main>
      <MainNavigation active="explore" onNavigate={onNavigate} />
    </div>
  )
}

function ServiceDetailScreen({
  service,
  back,
  book,
  openProvider,
  openService,
  seeAllHelpers,
}: {
  service: ServiceInfo
  back: () => void
  book: () => void
  openProvider: (id: string) => void
  openService: (title: string) => void
  seeAllHelpers: () => void
}) {
  const related =
    exploreGroups
      .find((group) => group.items.includes(service.title))
      ?.items.filter((item) => item !== service.title) ?? []
  const steps = [
    ["Tell us the details", "Confirm tasks, date, time, and address."],
    ["Choose a plan", "Compare options and pick your helper."],
    ["Relax", "Your helper arrives and you can message them anytime."],
  ]
  return (
    <div className="screen booking-flow-screen">
      <FlowHeader
        back={back}
        step={categoryLabels[service.category]}
        title={service.title}
      />
      <main className="screen-scroll service-detail-content">
        <img
          alt={service.title}
          className="service-hero"
          src={photoAt(service.title, 800)}
        />
        <p className="service-lede">{service.tagline}</p>
        <section className="service-meta">
          <span>
            <small>Duration</small>
            <strong>{hoursLabel(service.hours).replace("About ", "")}</strong>
          </span>
          <span>
            <small>From</small>
            <strong>${service.price}</strong>
          </span>
          <span>
            <small>Helpers</small>
            <strong>{service.helperIds.length} nearby</strong>
          </span>
        </section>
        <section className="service-info-card">
          <h2>What’s included</h2>
          <ul className="service-includes">
            {service.includes.map((item) => (
              <li key={item}>
                <Icon name="check" size={15} />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="service-info-card">
          <h2>How it works</h2>
          <ol className="service-steps">
            {steps.map(([title, text], index) => (
              <li key={title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="service-info-card">
          <div className="helper-section-head">
            <h2>Available helpers</h2>
            {EXPLORE_ENABLED && (
              <button onClick={seeAllHelpers} type="button">
                See all
              </button>
            )}
          </div>
          <HelperRows ids={service.helperIds.slice(0, 3)} openProvider={openProvider} />
        </section>
        <section className="service-related">
          <h2>Related services</h2>
          <div className="explore-grid">
            {related.map((item) => (
              <button
                className="explore-service"
                key={item}
                onClick={() => openService(item)}
                type="button"
              >
                <img alt="" src={servicePhotos[item]} />
                <strong>{item}</strong>
                <Icon name="chevron" size={13} />
              </button>
            ))}
          </div>
        </section>
      </main>
      <div className="warm-sticky-footer">
        <span>
          <strong>From ${service.price}</strong>
          <small>{hoursLabel(service.hours)}</small>
        </span>
        <Button onClick={book}>Book this service</Button>
      </div>
    </div>
  )
}

function useSwipeDown(onDismiss: () => void) {
  const startY = useRef(0)
  return {
    onTouchStart: (event: React.TouchEvent) => {
      startY.current = event.touches[0].clientY
    },
    onTouchEnd: (event: React.TouchEvent) => {
      if (event.changedTouches[0].clientY - startY.current > 70) onDismiss()
    },
  }
}

function CalendarModal({
  close,
  confirm,
}: {
  close: () => void
  confirm: (date: string) => void
}) {
  const [month, setMonth] = useState(9)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const swipe = useSwipeDown(close)
  const monthDate = new Date(2026, month, 1)
  const monthLabel = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
  const daysInMonth = new Date(2026, month + 1, 0).getDate()
  const leadingDays = monthDate.getDay()
  const unavailable = (day: number) =>
    month === 9 && [4, 8, 11, 15, 18, 22, 25, 29].includes(day)

  return (
    <div className="nested-overlay">
      <button
        aria-label="Close calendar"
        className="overlay-scrim"
        onClick={close}
        type="button"
      />
      <section className="calendar-modal" {...swipe}>
        <div className="sheet-handle" />
        <div className="overlay-heading">
          <h2>Select a date</h2>
          <Button
            ariaLabel="Close calendar"
            className="plain-close"
            onClick={close}
            variant="icon"
          >
            <Icon name="x" />
          </Button>
        </div>
        <div className="calendar-month">
          <Button
            ariaLabel="Previous month"
            className="plain-close"
            onClick={() => setMonth((current) => current - 1)}
            variant="icon"
          >
            <Icon name="arrow-left" />
          </Button>
          <strong>{monthLabel}</strong>
          <Button
            ariaLabel="Next month"
            className="plain-close"
            onClick={() => setMonth((current) => current + 1)}
            variant="icon"
          >
            <Icon name="chevron" />
          </Button>
        </div>
        <div className="weekday-row">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="month-grid">
          {Array.from({ length: leadingDays }).map((_, index) => (
            <span key={`empty-${index}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
            (day) => {
              const isUnavailable = unavailable(day)
              const isSelected = month === 9 && day === selectedDay
              const isToday = month === 9 && day === 20
              return (
                <button
                  aria-label={`${monthLabel} ${day}${
                    isUnavailable ? ", unavailable" : ""
                  }`}
                  className={`${isSelected ? "selected" : ""} ${
                    isToday ? "today" : ""
                  } ${isUnavailable ? "unavailable" : ""}`}
                  disabled={isUnavailable}
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  type="button"
                >
                  {day}
                </button>
              )
            },
          )}
        </div>
        <div className="calendar-legend">
          <span>
            <i className="available-key" />
            Available
          </span>
          <span>
            <i className="unavailable-key" />
            Unavailable
          </span>
        </div>
        <Button
          disabled={!selectedDay}
          onClick={() => {
            if (month === 9 && selectedDay === 24) confirm(selectedDateLabel)
            else if (selectedDay) {
              confirm(
                new Date(2026, month, selectedDay).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                }),
              )
            }
          }}
        >
          Select Date
        </Button>
      </section>
    </div>
  )
}

function DateSelectionCard({
  value,
  apply,
}: {
  value: string
  apply: (value: string) => void
}) {
  const savedFlexible = value.includes(" · ")
  const [savedWhen = "", savedSoon = ""] = value.split(" · ")
  const parsedExactDate =
    !savedFlexible && value ? new Date(`${value}, 2026`) : null
  const hasSavedExactDate =
    parsedExactDate !== null && !Number.isNaN(parsedExactDate.getTime())
  const savedExactDay = hasSavedExactDate ? parsedExactDate.getDate() : null
  const savedExactMonth = hasSavedExactDate ? parsedExactDate.getMonth() : null
  const [tab, setTab] = useState<"date" | "flexible">(
    savedFlexible ? "flexible" : "date",
  )
  const [when, setWhen] = useState(savedWhen)
  const [soon, setSoon] = useState(savedSoon)
  const [month, setMonth] = useState(savedExactMonth ?? 9)
  const [selectedDay, setSelectedDay] = useState<number | null>(savedExactDay)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    savedExactMonth,
  )
  const monthDate = new Date(2026, month, 1)
  const monthLabel = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
  const daysInMonth = new Date(2026, month + 1, 0).getDate()
  const leadingDays = monthDate.getDay()
  const unavailable = (day: number) =>
    month === 9 && [4, 8, 11, 15, 18, 22, 25, 29].includes(day)
  const confirmExactDate = () => {
    if (selectedDay === null || selectedMonth === null) return
    const selected = new Date(2026, selectedMonth, selectedDay)
    if (selectedMonth === 9 && selectedDay === 24) apply(selectedDateLabel)
    else
      apply(
        selected.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
      )
  }

  return (
    <section className="floating-selection-card preference-date-card">
      <h2 className="date-card-title">When do you need help?</h2>
      <div className="date-mode-control">
        <button
          className={tab === "date" ? "selected" : ""}
          onClick={() => setTab("date")}
          type="button"
        >
          Choose date
        </button>
        <button
          className={tab === "flexible" ? "selected" : ""}
          onClick={() => setTab("flexible")}
          type="button"
        >
          Flexible
        </button>
      </div>
      {tab === "date" ? (
        <div className="exact-date-content">
          <div className="date-month-heading">
            <Button
              ariaLabel="Previous month"
              className="plain-close"
              onClick={() => setMonth((current) => current - 1)}
              variant="icon"
            >
              <Icon name="arrow-left" size={18} />
            </Button>
            <strong>{monthLabel}</strong>
            <Button
              ariaLabel="Next month"
              className="plain-close"
              onClick={() => setMonth((current) => current + 1)}
              variant="icon"
            >
              <Icon name="chevron" size={18} />
            </Button>
          </div>
          <div className="date-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-grid">
            {Array.from({ length: leadingDays }).map((_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
              (day) => {
                const blocked = unavailable(day)
                const selected = selectedMonth === month && selectedDay === day
                return (
                  <button
                    className={`${selected ? "selected" : ""} ${
                      month === 9 && day === 20 ? "today" : ""
                    } ${blocked ? "unavailable" : ""}`}
                    disabled={blocked}
                    key={day}
                    onClick={() => {
                      setSelectedDay(day)
                      setSelectedMonth(month)
                    }}
                    type="button"
                  >
                    {day}
                  </button>
                )
              },
            )}
          </div>
          <button
            aria-label="Confirm selected date"
            className="picker-confirm"
            disabled={selectedDay === null || selectedMonth === null}
            onClick={confirmExactDate}
            type="button"
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>
      ) : (
        <div className="flexible-date-content">
          <div className="preference-section">
            <h2>When works best?</h2>
            <div className="large-option-row">
              {["Weekday", "Weekend", "Anytime"].map((option) => (
                <button
                  className={when === option ? "selected" : ""}
                  key={option}
                  onClick={() => setWhen(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="preference-divider" />
          <div className="preference-section">
            <h2>How soon do you need it?</h2>
            <div className="large-option-row">
              {["This week", "Next week", "This month"].map((option) => (
                <button
                  className={soon === option ? "selected" : ""}
                  key={option}
                  onClick={() => setSoon(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <button
            aria-label="Confirm date preference"
            className="picker-confirm"
            disabled={!when || !soon}
            onClick={() => apply(`${when} · ${soon}`)}
            type="button"
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>
      )}
    </section>
  )
}

function WheelColumn({
  values,
  selected,
  onSelect,
}: {
  values: string[]
  selected: string
  onSelect: (value: string) => void
}) {
  const wheelRef = useRef<HTMLDivElement>(null)
  const selectedIndex = values.indexOf(selected)
  const orderedValues =
    selectedIndex < 0
      ? values
      : [
          values[(selectedIndex - 1 + values.length) % values.length],
          ...Array.from(
            { length: values.length - 1 },
            (_, offset) => values[(selectedIndex + offset) % values.length],
          ),
        ]
  useEffect(() => {
    if (wheelRef.current) wheelRef.current.scrollTop = 0
  }, [selected, values])
  return (
    <div className="wheel-column" ref={wheelRef}>
      {orderedValues.map((value) => (
        <button
          className={selected === value ? "selected" : ""}
          key={value}
          onClick={() => onSelect(value)}
          type="button"
        >
          {value}
        </button>
      ))}
    </div>
  )
}

function TimeSelectionCard({
  value,
  apply,
}: {
  value: string
  apply: (value: string) => void
}) {
  const parsed = value.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/)
  const [hour, setHour] = useState(parsed?.[1] ?? "9")
  const [minute, setMinute] = useState(parsed?.[2] ?? "30")
  const [period, setPeriod] = useState(parsed?.[3] ?? "AM")
  const [flexible, setFlexible] = useState(value === "Flexible time")
  const [touched, setTouched] = useState(Boolean(parsed))

  const selectValue = (setter: (value: string) => void, next: string) => {
    setter(next)
    setTouched(true)
  }

  return (
    <section className="floating-selection-card single-time-card">
      <div className="time-card-heading">
        <h2>What time works?</h2>
        <button
          aria-checked={flexible}
          className="flexible-switch-control"
          onClick={() => setFlexible((current) => !current)}
          role="switch"
          type="button"
        >
          <span>Flexible</span>
          <i className={flexible ? "on" : ""}>
            <span />
          </i>
        </button>
      </div>
      <div
        className={`wheel-picker single-time-wheel ${
          flexible ? "disabled" : ""
        }`}
      >
        <WheelColumn
          onSelect={(next) => selectValue(setHour, next)}
          selected={hour}
          values={[
            "7",
            "8",
            "9",
            "10",
            "11",
            "12",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
          ]}
        />
        <WheelColumn
          onSelect={(next) => selectValue(setMinute, next)}
          selected={minute}
          values={["00", "15", "30", "45"]}
        />
        <WheelColumn
          onSelect={(next) => selectValue(setPeriod, next)}
          selected={period}
          values={["AM", "PM"]}
        />
      </div>
      <button
        aria-label="Confirm selected time"
        className="picker-confirm"
        disabled={!flexible && !touched}
        onClick={() =>
          apply(flexible ? "Flexible time" : `${hour}:${minute} ${period}`)
        }
        type="button"
      >
        <Icon name="chevron" size={18} />
      </button>
    </section>
  )
}

function Composer({
  close,
  next,
  date,
  setDate,
  time,
  setTime,
  address,
  setAddress,
  initialRequest = request,
}: {
  close: () => void
  next: () => void
  date: string
  setDate: (date: string) => void
  time: string
  setTime: (time: string) => void
  address: string
  setAddress: (address: string) => void
  initialRequest?: string
}) {
  const [picker, setPicker] = useState<"date" | "time" | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [requestText, setRequestText] = useState(initialRequest)
  const [selectedExample, setSelectedExample] = useState("")
  const swipe = useSwipeDown(close)
  const examples = [
    {
      label: "Prepare for guests",
      text: "I have guests coming on Saturday. I need dinner prepared, the living room reset, and my kitchen cabinets organized.",
    },
    {
      label: "Weekly meal prep",
      text: "I need someone to prepare meals for the week.",
    },
    {
      label: "Organize my kitchen",
      text: "I need help organizing my kitchen cabinets and pantry.",
    },
  ]

  return (
    <div className="composer-overlay">
      <button
        aria-label="Close request composer"
        className="sheet-scrim"
        onClick={close}
        type="button"
      />
      <section
        className="composer-sheet"
        aria-modal="true"
        role="dialog"
        {...swipe}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h1>What do you need?</h1>
          <Button
            ariaLabel="Close request composer"
            className="sheet-close"
            onClick={close}
            variant="icon"
          >
            <Icon name="x" />
          </Button>
        </div>

        <div className="composer-scroll">
          <div className="request-input-container">
            <textarea
              aria-label="Your request"
              onChange={(event) => {
                setRequestText(event.target.value)
                setSelectedExample("")
              }}
              placeholder="Describe the tasks you need help with…"
              rows={6}
              value={requestText}
            />
            <div>
              {examples.map((example) => (
                <button
                  className={
                    selectedExample === example.label ? "selected" : ""
                  }
                  key={example.label}
                  onClick={() => {
                    setRequestText(example.text)
                    setSelectedExample(example.label)
                  }}
                  type="button"
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>

          <div className="composer-tools">
            <Button
              ariaLabel="Add a photo"
              className={cameraActive ? "tool-active" : ""}
              onClick={() => setCameraActive((active) => !active)}
              variant="icon"
            >
              <Icon name="camera" size={20} />
            </Button>
            <Button
              ariaLabel="Use voice input"
              className={micActive ? "tool-active" : ""}
              onClick={() => setMicActive((active) => !active)}
              variant="icon"
            >
              <Icon name="mic" size={20} />
            </Button>
          </div>

          <div className="compact-fields separated-fields">
            <div className="field-stack">
              <button
                className="field-button"
                onClick={() =>
                  setPicker((current) => (current === "date" ? null : "date"))
                }
                type="button"
              >
                <Icon name="calendar" size={18} />
                <strong className={date ? "" : "placeholder"}>
                  {date || "Choose a date"}
                </strong>
                <Icon name="chevron" size={16} />
              </button>
            </div>
            <div className="field-stack">
              <button
                className="field-button"
                onClick={() =>
                  setPicker((current) => (current === "time" ? null : "time"))
                }
                type="button"
              >
                <Icon name="clock" size={18} />
                <strong className={time ? "" : "placeholder"}>
                  {time || "Choose a time"}
                </strong>
                <Icon name="chevron" size={16} />
              </button>
            </div>
            <div className="field-stack">
              <button className="field-button" type="button">
                <Icon name="pin" size={18} />
                <strong>{address || selectedAddressLabel}</strong>
                <Icon name="chevron" size={16} />
              </button>
            </div>
          </div>
        </div>
        <div className="composer-bottom-action">
          <Button
            disabled={!requestText.trim() || !date || !time}
            onClick={next}
          >
            Create My Plan
          </Button>
        </div>
        {picker && (
          <div className="composer-picker-layer">
            <button
              aria-label="Dismiss selection"
              className="composer-picker-scrim"
              onClick={() => setPicker(null)}
              type="button"
            />
            {picker === "date" ? (
              <DateSelectionCard
                apply={(value) => {
                  setDate(value)
                  setPicker(null)
                }}
                value={date}
              />
            ) : (
              <TimeSelectionCard
                apply={(value) => {
                  setTime(value)
                  setPicker(null)
                }}
                value={time}
              />
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function TasksScreen({
  checked,
  setChecked,
  back,
  next,
  date,
  address,
  time,
}: {
  checked: boolean[]
  setChecked: (value: boolean[]) => void
  back: () => void
  next: () => void
  date: string
  address: string
  time: string
}) {
  return (
    <div className="screen">
      <main className="screen-scroll with-bottom-action">
        <Header onBack={back} title="Your tasks" />
        <Progress step={1} />
        <BookingContext address={address} date={date} time={time} />
        <section className="content-stack">
          <div className="task-list">
            {tasks.map((task, index) => (
              <div className="task-row" key={task}>
                <button
                  aria-label={`${checked[index] ? "Uncheck" : "Check"} ${task}`}
                  className={`checkbox ${checked[index] ? "checked" : ""}`}
                  onClick={() =>
                    setChecked(
                      checked.map((value, itemIndex) =>
                        itemIndex === index ? !value : value,
                      ),
                    )
                  }
                  type="button"
                >
                  {checked[index] && <Icon name="check" size={15} />}
                </button>
                <span>{task}</span>
                <Button ariaLabel={`Edit ${task}`} variant="icon">
                  <Icon name="edit" size={17} />
                </Button>
                <Button ariaLabel={`Remove ${task}`} variant="icon">
                  <Icon name="x" size={17} />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="text">
            <Icon name="plus" size={18} /> Add another task
          </Button>

          <section className="clarification-card">
            <h2>Who will provide the groceries?</h2>
            <div className="segmented">
              <button className="selected" type="button">
                I’ll provide them
              </button>
              <button type="button">Helper purchases them</button>
            </div>
          </section>
        </section>
      </main>
      <BottomAction onClick={next}>See My Options</BottomAction>
    </div>
  )
}

function PlansScreen({
  selected,
  setSelected,
  back,
  next,
  date,
  address,
  time,
}: {
  selected: PlanId
  setSelected: (id: PlanId) => void
  back: () => void
  next: () => void
  date: string
  address: string
  time: string
}) {
  return (
    <div className="screen">
      <main className="screen-scroll with-bottom-action">
        <Header onBack={back} title="Choose a plan" />
        <Progress step={2} />
        {(date.startsWith("Any") ||
          date.startsWith("This") ||
          date.startsWith("Weekday") ||
          date.startsWith("Weekend") ||
          ["Morning", "Afternoon", "Evening", "Anytime"].includes(time)) && (
          <p className="flexible-results-note">
            Based on your flexible schedule
          </p>
        )}
        <section className="plan-list">
          {planOptions.map((plan) => (
            <button
              aria-pressed={selected === plan.id}
              className={`plan-card ${selected === plan.id ? "selected" : ""}`}
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              type="button"
            >
              <span className="radio">{selected === plan.id && <span />}</span>
              <span className="plan-content">
                <strong>{plan.title}</strong>
                <span className="plan-meta">
                  {plan.details.map((detail) => (
                    <span key={detail}>
                      {detail === "Saturday" ? date || detail : detail}
                    </span>
                  ))}
                </span>
                <span className="plan-description">{plan.description}</span>
              </span>
            </button>
          ))}
        </section>
      </main>
      <BottomAction onClick={next}>Continue</BottomAction>
    </div>
  )
}

function PlanDetails({
  selected,
  back,
  next,
  date,
  time,
  edit,
}: {
  selected: PlanId
  back: () => void
  next: () => void
  date: string
  time: string
  edit: (screen: Screen) => void
}) {
  const selectedPlan = planOptions.find((plan) => plan.id === selected)!
  const isTeam = selected === "team"
  const [editOpen, setEditOpen] = useState(false)
  const editSwipe = useSwipeDown(() => setEditOpen(false))
  return (
    <div className="screen">
      <main className="screen-scroll with-bottom-action">
        <Header
          onBack={back}
          subtitle="Home preparation for Saturday"
          title="Your Service Plan"
        />
        <Progress step={3} />
        <div className="summary-strip">
          <span>
            {selected === "split" ? "Fri + Sat" : date || selectedDateLabel}
          </span>
          <span>{selected === "solo" ? "1 helper" : "2 helpers"}</span>
          <span>
            {selectedPlan.details.find((detail) => detail.includes("hours")) ??
              "Two visits"}
          </span>
        </div>
        <p className="selected-time-note">{time || "10:00 AM–4:00 PM"}</p>

        <section className="timeline">
          <div className="timeline-item">
            <span className="timeline-dot" />
            <div>
              <time>{isTeam ? "10:00 AM–1:00 PM" : "10:00 AM–1:00 PM"}</time>
              <strong>Maria</strong>
              <p>Prepare dinner for 6 people</p>
            </div>
          </div>
          <div className="timeline-item">
            <span className="timeline-dot" />
            <div>
              <time>
                {isTeam
                  ? "12:00 PM–4:00 PM"
                  : selected === "split"
                    ? "Friday, 1:00 PM–5:00 PM"
                    : "1:00 PM–4:00 PM"}
              </time>
              <strong>{selected === "solo" ? "Maria" : "Jasmine"}</strong>
              <p>Organize kitchen cabinets</p>
              <p>Reset living and dining area</p>
            </div>
          </div>
        </section>

        <section className="detail-sections">
          <div>
            <h2>Groceries</h2>
            <p>User will provide groceries</p>
          </div>
          <div>
            <h2>Supplies</h2>
            <p>Helpers bring basic organization and cleaning supplies</p>
          </div>
        </section>
        <Button
          className="edit-plan-button"
          onClick={() => setEditOpen(true)}
          variant="secondary"
        >
          Edit Plan
        </Button>
      </main>
      <BottomAction onClick={next}>Continue</BottomAction>
      {editOpen && (
        <div className="overlay-layer">
          <button
            aria-label="Close plan editing"
            className="overlay-scrim"
            onClick={() => setEditOpen(false)}
            type="button"
          />
          <section className="manage-sheet" {...editSwipe}>
            <div className="sheet-handle" />
            <div className="overlay-heading">
              <h2>Edit Plan</h2>
              <Button
                ariaLabel="Close plan editing"
                className="plain-close"
                onClick={() => setEditOpen(false)}
                variant="icon"
              >
                <Icon name="x" />
              </Button>
            </div>
            {[
              ["Edit tasks", 3],
              ["Change date", 2],
              ["Change time", 5],
            ].map(([label, target]) => (
              <button
                key={label}
                onClick={() => {
                  setEditOpen(false)
                  edit(target as Screen)
                }}
                type="button"
              >
                <span>{label}</span>
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}

function HelperCard({
  id,
  initials,
  name,
  skill,
  rating,
  tasksDone,
  match,
  saved,
  onToggleSaved,
  onOpen,
}: {
  id: string
  initials: string
  name: string
  skill: string
  rating: string
  tasksDone: number
  match: string
  saved: boolean
  onToggleSaved: (id: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <article
      className="helper-card clickable-card"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) onOpen(id)
      }}
    >
      <div className="helper-top">
        <img
          alt={name}
          className="avatar avatar-photo"
          src={helperPhotos[id]}
        />
        <div className="helper-identity">
          <h2>{name}</h2>
          <p>{skill}</p>
        </div>
        <div className="helper-card-actions">
          <Button variant="secondary">Replace</Button>
        </div>
      </div>
      <div className="helper-stats">
        <span>
          <strong>{rating}</strong> rating
        </span>
        <span>
          <strong>{tasksDone}</strong> completed tasks
        </span>
      </div>
      <div className="match-note">
        <strong>Why she matches</strong>
        <p>{match}</p>
      </div>
    </article>
  )
}

function HelpersScreen({
  back,
  next,
  date,
  address,
  savedProviders,
  onToggleSaved,
  onOpenProvider,
}: {
  back: () => void
  next: () => void
  date: string
  address: string
  savedProviders: string[]
  onToggleSaved: (id: string) => void
  onOpenProvider: (id: string) => void
}) {
  return (
    <div className="screen">
      <main className="screen-scroll with-bottom-action">
        <Header onBack={back} title="Your Helpers" />
        <Progress step={4} />
        <section className="helper-list">
          <HelperCard
            id="maria"
            initials="MG"
            match="Available Saturday and experienced with in-home dinner preparation."
            name="Maria G."
            rating="4.9"
            skill="Home cooking"
            tasksDone={124}
            saved={savedProviders.includes("maria")}
            onToggleSaved={onToggleSaved}
            onOpen={onOpenProvider}
          />
          <HelperCard
            id="jasmine"
            initials="JR"
            match="Experienced with kitchen and cabinet organization."
            name="Jasmine R."
            rating="4.8"
            skill="Home organization"
            tasksDone={86}
            saved={savedProviders.includes("jasmine")}
            onToggleSaved={onToggleSaved}
            onOpen={onOpenProvider}
          />
        </section>
      </main>
      <BottomAction onClick={next}>Review Booking</BottomAction>
    </div>
  )
}

function BookingScreen({
  back,
  next,
  date,
  address,
  paymentMethod,
  setPaymentMethod,
  time,
}: {
  back: () => void
  next: () => void
  date: string
  address: string
  paymentMethod: string
  setPaymentMethod: (method: string) => void
  time: string
}) {
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [additionalCard, setAdditionalCard] = useState(false)
  const [processing, setProcessing] = useState(false)
  const cardSwipe = useSwipeDown(() => setAddCardOpen(false))
  const payAndBook = () => {
    if (processing) return
    setProcessing(true)
    window.setTimeout(next, 700)
  }

  return (
    <div className="screen">
      <main className="screen-scroll with-bottom-action">
        <Header onBack={back} title="Pay & book" />
        <Progress step={5} />
        <section className="order-card">
          <div className="order-heading">
            <div>
              <h2>Your Service Plan</h2>
            </div>
            <Icon name="check" />
          </div>
          <p className="order-place">
            {date || selectedDateLabel}
            <br />
            {time || "10:00 AM–4:00 PM"}
            <br />
            {address || selectedAddressLabel}
          </p>
          <div className="order-section">
            <h3>Tasks</h3>
            <ul>
              <li>Dinner preparation</li>
              <li>Living-area reset</li>
              <li>Kitchen cabinet organization</li>
            </ul>
          </div>
          <div className="order-section">
            <h3>Helpers</h3>
            <p>Maria G. and Jasmine R.</p>
          </div>
          <div className="price-list">
            <span>
              Services <strong>$320</strong>
            </span>
            <span>
              Service fee <strong>$24</strong>
            </span>
            <span className="total">
              Estimated total <strong>$344</strong>
            </span>
          </div>
        </section>
        <section className="payment-section">
          <h2>Payment method</h2>
          <button
            className={`payment-option ${
              paymentMethod === "Apple Pay" ? "selected" : ""
            }`}
            onClick={() => setPaymentMethod("Apple Pay")}
            type="button"
          >
            <span className="payment-mark">Apple</span>
            <span>
              <strong>Apple Pay</strong>
              <small>Pay using Apple Pay</small>
            </span>
            <span className="radio">
              {paymentMethod === "Apple Pay" && <span />}
            </span>
          </button>
          <button
            className={`payment-option ${
              paymentMethod === "Card ending in 4242" ? "selected" : ""
            }`}
            onClick={() => setPaymentMethod("Card ending in 4242")}
            type="button"
          >
            <span className="payment-mark">
              <Icon name="card" size={20} />
            </span>
            <span>
              <strong>Card ending in 4242</strong>
              <small>Visa</small>
            </span>
            <span className="radio">
              {paymentMethod === "Card ending in 4242" && <span />}
            </span>
          </button>
          {additionalCard && (
            <button
              className={`payment-option ${
                paymentMethod === "Card ending in 7878" ? "selected" : ""
              }`}
              onClick={() => setPaymentMethod("Card ending in 7878")}
              type="button"
            >
              <span className="payment-mark">
                <Icon name="card" size={20} />
              </span>
              <span>
                <strong>Card ending in 7878</strong>
                <small>Visa</small>
              </span>
              <span className="radio">
                {paymentMethod === "Card ending in 7878" && <span />}
              </span>
            </button>
          )}
          <Button onClick={() => setAddCardOpen(true)} variant="text">
            Add another card
          </Button>
        </section>
      </main>
      <div className="bottom-action">
        <Button disabled={processing} onClick={payAndBook}>
          {processing ? "Processing…" : "Pay $344 & Book"}
        </Button>
      </div>
      {addCardOpen && (
        <div className="overlay-layer">
          <button
            aria-label="Close card form"
            className="overlay-scrim"
            onClick={() => setAddCardOpen(false)}
            type="button"
          />
          <section className="add-card-sheet" {...cardSwipe}>
            <div className="sheet-handle" />
            <div className="overlay-heading">
              <h2>Add a card</h2>
              <Button
                ariaLabel="Close card form"
                className="plain-close"
                onClick={() => setAddCardOpen(false)}
                variant="icon"
              >
                <Icon name="x" />
              </Button>
            </div>
            <div className="card-form">
              <label>
                <span>Card number</span>
                <input inputMode="numeric" placeholder="1234 5678 9012 7878" />
              </label>
              <div>
                <label>
                  <span>Expiration date</span>
                  <input placeholder="MM / YY" />
                </label>
                <label>
                  <span>Security code</span>
                  <input inputMode="numeric" placeholder="CVV" />
                </label>
              </div>
              <label>
                <span>Billing ZIP code</span>
                <input inputMode="numeric" placeholder="10011" />
              </label>
            </div>
            <Button
              onClick={() => {
                setAdditionalCard(true)
                setPaymentMethod("Card ending in 7878")
                setAddCardOpen(false)
              }}
            >
              Save Card
            </Button>
          </section>
        </div>
      )}
    </div>
  )
}

function Confirmation({
  viewPlan,
  date,
  paymentMethod,
  time,
  onNavigate,
}: {
  viewPlan: () => void
  date: string
  paymentMethod: string
  time: string
  onNavigate: (page: NavPage) => void
}) {
  return (
    <div className="screen confirmation confirmation-with-nav">
      <main>
        <div className="confirmation-icon">
          <Icon name="check" size={32} />
        </div>
        <h1>Your service is booked</h1>
        <p>Maria and Jasmine will arrive on Saturday, October 24.</p>
        <section className="confirmation-card">
          <div>
            <span>Schedule</span>
            <strong>{time || "10:00 AM–4:00 PM"}</strong>
          </div>
          <div>
            <span>Plan</span>
            <strong>2 helpers · 3 tasks</strong>
          </div>
          <div>
            <span>Payment</span>
            <strong>Paid with {paymentMethod}</strong>
          </div>
          <div className="confirmation-total">
            <span>Total</span>
            <strong>$344</strong>
          </div>
        </section>
      </main>
      <div className="confirmation-actions">
        <Button onClick={viewPlan}>View my plan</Button>
      </div>
      <MainNavigation active="tasks" onNavigate={onNavigate} taskNotice />
    </div>
  )
}

function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string
  subtitle?: string
  back?: () => void
  action?: ReactNode
}) {
  return (
    <header className={`page-header ${back ? "with-back" : ""}`}>
      {back && (
        <Button ariaLabel="Go back" onClick={back} variant="icon">
          <Icon name="arrow-left" />
        </Button>
      )}
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

function TaskCard({
  status,
  title,
  details,
  initials = [],
  helperIds,
  photo,
  onOpen,
  onOpenProvider,
}: {
  status: string
  title: string
  details: string[]
  initials?: string[]
  helperIds?: string[]
  photo?: string
  onOpen: () => void
  onOpenProvider: (id: string) => void
}) {
  const avatarIds =
    helperIds ??
    initials.map((initial) =>
      initial === "AD" ? "clara" : initial === "JR" ? "jasmine" : "maria",
    )
  return (
    <article
      className="task-card clickable-card"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) onOpen()
      }}
    >
      <span className="status-label">{status}</span>
      <div className="task-card-heading">
        <img alt="" className="service-thumbnail" src={photo ?? servicePhotos[title]} />
        <h2>{title}</h2>
        <div className="stacked-avatars">
          {avatarIds.map((id) => (
            <button
              aria-label={`Open ${providerName(id)} profile`}
              key={id}
              onClick={() => onOpenProvider(id)}
              type="button"
            >
              <img alt="" src={helperPhotos[id]} />
            </button>
          ))}
        </div>
      </div>
      <div className="task-card-details">
        {details.map((detail) => {
          const providerId = detail.includes("Clara")
            ? "clara"
            : detail.includes("Jasmine")
              ? "jasmine"
              : detail.includes("Maria")
                ? "maria"
                : null
          return providerId ? (
            <button
              className="task-helper-link"
              key={detail}
              onClick={() => onOpenProvider(providerId)}
              type="button"
            >
              {detail}
            </button>
          ) : (
            <span key={detail}>{detail}</span>
          )
        })}
      </div>
      <div className="task-card-action">
        <Button className="task-detail-link" onClick={onOpen} variant="text">
          View details <span aria-hidden="true">→</span>
        </Button>
      </div>
    </article>
  )
}

function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  title: string
  text: string
  action: string
  onAction: () => void
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="list" size={25} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <Button onClick={onAction}>{action}</Button>
    </div>
  )
}

function bookingCardDetails(booking: Booking) {
  return [
    booking.date,
    booking.time,
    booking.helperIds.length === 1
      ? providerName(booking.helperIds[0])
      : `${booking.helperIds.length} helpers`,
    booking.countLabel ??
      `${booking.tasks.length} task${booking.tasks.length === 1 ? "" : "s"}`,
    ...(booking.id === "tailoring" ? [] : [`Total: ${booking.total}`]),
  ]
}

function TasksPage({
  booked,
  bookings,
  onNavigate,
  openTask,
  openProvider,
  openInbox,
  goHome,
}: {
  booked: boolean
  bookings: Booking[]
  onNavigate: (page: NavPage) => void
  openTask: (task: string) => void
  openProvider: (id: string) => void
  openInbox: () => void
  goHome: () => void
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming")
  const upcomingBookings = nearestFirst(
    bookings.filter((booking) => booking.status === "upcoming"),
  )
  const cancelledBookings = bookings.filter(
    (booking) => booking.status === "cancelled",
  )

  return (
    <div className="screen main-page tasks-page">
      <main className="screen-scroll main-page-content">
        <PageHeader
          action={
            <Button
              ariaLabel="Open messages"
              onClick={openInbox}
              variant="icon"
            >
              <Icon name="message" />
            </Button>
          }
          title="Tasks"
        />
        <div className="saved-tabs tasks-tabs">
          <button
            className={tab === "upcoming" ? "selected" : ""}
            onClick={() => setTab("upcoming")}
            type="button"
          >
            Upcoming
          </button>
          <button
            className={tab === "past" ? "selected" : ""}
            onClick={() => setTab("past")}
            type="button"
          >
            Past
          </button>
        </div>

        {tab === "upcoming" && (
          <section className="page-card-list">
            {upcomingBookings.map((booking) => (
              <TaskCard
                details={bookingCardDetails(booking)}
                helperIds={booking.helperIds}
                key={booking.id}
                onOpen={() => openTask(booking.id)}
                onOpenProvider={openProvider}
                photo={booking.photo}
                status={booking.statusLabel}
                title={booking.title}
              />
            ))}
            {upcomingBookings.length === 0 && (
              <EmptyState
                action="Find help"
                onAction={goHome}
                text="When you book a service, it will appear here."
                title="No upcoming tasks"
              />
            )}
          </section>
        )}

        {tab === "past" && (
          <section className="page-card-list">
            {cancelledBookings.map((booking) => (
              <TaskCard
                details={bookingCardDetails(booking)}
                helperIds={booking.helperIds}
                key={booking.id}
                onOpen={() => openTask(booking.id)}
                onOpenProvider={openProvider}
                photo={booking.photo}
                status={booking.statusLabel}
                title={booking.title}
              />
            ))}
            <TaskCard
              details={["October 8", "Jasmine R.", "Completed"]}
              initials={["JR"]}
              onOpen={() => openTask("organization")}
              onOpenProvider={openProvider}
              status="Completed"
              title="Home Organization"
            />
            <TaskCard
              details={["September 30", "Maria G.", "Completed"]}
              initials={["MG"]}
              onOpen={() => openTask("meal-prep")}
              onOpenProvider={openProvider}
              status="Completed"
              title="Weekly Meal Preparation"
            />
          </section>
        )}
      </main>
      <MainNavigation
        active="tasks"
        onNavigate={onNavigate}
        taskNotice={booked}
      />
    </div>
  )
}

function StarRating({ rating }: { rating: string }) {
  return (
    <span className="bd-stars" aria-label={`${rating} out of 5 stars`} role="img">
      ★★★★★
      <i style={{ width: `${(Number(rating) / 5) * 100}%` }}>★★★★★</i>
    </span>
  )
}

function AddToCalendar({
  booking,
  onAdded,
}: {
  booking: Booking
  onAdded: () => void
}) {
  const [choosing, setChoosing] = useState(false)
  if (booking.calendarAdded && !choosing) {
    return (
      <div className="bd-calendar-added" role="status">
        <span>
          <Icon name="check" size={16} /> Added to your calendar
        </span>
        <button onClick={() => setChoosing(true)} type="button">
          Add again
        </button>
      </div>
    )
  }
  if (!choosing) {
    return (
      <Button
        className="bd-calendar-button"
        onClick={() => setChoosing(true)}
        variant="secondary"
      >
        <Icon name="calendar" size={17} /> Add to calendar
      </Button>
    )
  }
  const finish = () => {
    setChoosing(false)
    onAdded()
  }
  return (
    <div className="bd-calendar-options">
      <Button
        onClick={() => {
          downloadCalendarFile(booking)
          finish()
        }}
        variant="secondary"
      >
        Apple / Outlook
      </Button>
      <Button
        onClick={() => {
          window.open(googleCalendarUrl(booking), "_blank", "noopener")
          finish()
        }}
        variant="secondary"
      >
        Google Calendar
      </Button>
    </div>
  )
}

function BookingDetailSections({
  booking,
  openProvider,
  onCalendarAdded,
  page = false,
}: {
  booking: Booking
  openProvider: (id: string) => void
  onCalendarAdded: () => void
  page?: boolean
}) {
  const cancelled = booking.status === "cancelled"
  const service = booking.serviceTitle ? services[booking.serviceTitle] : undefined
  const totalValue = Number(booking.total.replace("$", ""))
  const fee =
    booking.serviceFee ?? (booking.serviceTitle ? Math.round(totalValue * 0.11) : 36)
  const steps = [
    ["Booked", true],
    ["Confirmed", true],
    ["On the way", false],
    ["Completed", false],
  ] as const
  const summary = [
    booking.serviceTitle ?? "Multi-service plan",
    booking.planTitle,
    ...(booking.countLabel ? [booking.countLabel] : []),
  ].join(" · ")
  return (
    <div className={`bd-sections ${page ? "bd-sections--page" : ""}`}>
      {!cancelled && (
        <ol aria-label="Booking status" className="bd-steps">
          {steps.map(([label, done]) => (
            <li className={done ? "done" : ""} key={label}>
              <span />
              {label}
            </li>
          ))}
        </ol>
      )}

      <section className="sheet-detail-grid">
        <div>
          <span>Date and time</span>
          <strong>
            {booking.date} · {booking.time}
          </strong>
        </div>
        <div>
          <span>{booking.helperIds.length === 1 ? "Your helper" : "Your helpers"}</span>
          {booking.helperIds.map((id) => {
            const provider = providers.find((item) => item.id === id)!
            return (
              <button
                className="bd-helper-row"
                key={id}
                onClick={() => openProvider(id)}
                type="button"
              >
                <img alt="" src={helperPhotos[id]} />
                <span>
                  <strong>{provider.name}</strong>
                  <StarRating rating={provider.rating} />
                </span>
                <Icon name="chevron" size={15} />
              </button>
            )
          })}
        </div>
        <div>
          <span>Estimated duration</span>
          <strong>{hoursLabel(bookingHours(booking))}</strong>
        </div>
        {!cancelled && (
          <div>
            <span>Arrival</span>
            <strong>Within 15 minutes of your start time</strong>
          </div>
        )}
        <div>
          <span>Address</span>
          <strong>{booking.address}</strong>
        </div>
        <div>
          <span>Access</span>
          <strong>{booking.access}</strong>
        </div>
      </section>

      {!cancelled && bookingHasConfirmedTime(booking) && (
        <AddToCalendar booking={booking} onAdded={onCalendarAdded} />
      )}

      <section className="service-info-card">
        <h2>Service details</h2>
        <p className="bd-summary">{summary}</p>
        <dl className="bd-lines">
          <div>
            <dt>Tasks</dt>
            <dd>{booking.tasks.join(", ")}</dd>
          </div>
          {service && (
            <div>
              <dt>Includes</dt>
              <dd>{service.includes.slice(0, 3).join(", ")}</dd>
            </div>
          )}
          {!cancelled && (
            <div>
              <dt>Before your visit</dt>
              <dd>{categoryPrep[bookingCategory(booking)]}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="service-info-card">
        <h2>Payment</h2>
        <div className="bd-rows">
          <p>
            <span>Service</span>
            <strong>${totalValue - fee}</strong>
          </p>
          <p>
            <span>Service and protection fee</span>
            <strong>${fee}</strong>
          </p>
          <p className="bd-total">
            <span>{cancelled ? "Refund" : "Total paid"}</span>
            <strong>{booking.total}</strong>
          </p>
          <p>
            <span>Payment method</span>
            <strong>{booking.paymentMethod}</strong>
          </p>
          <p>
            <span>Plan reference</span>
            <strong>{booking.reference}</strong>
          </p>
        </div>
      </section>

      {!cancelled && (
        <p className="bd-fine-print">
          Free cancellation up to 24 hours before your visit. Reschedule anytime
          from Manage booking. Your booking is covered by our service and
          protection fee.
        </p>
      )}
    </div>
  )
}

function BookedPlanDetails({
  booking,
  back,
  onNavigate,
  openProvider,
  message,
  manage,
  bookAgain,
  onCalendarAdded,
}: {
  onCalendarAdded: () => void
  booking: Booking
  back: () => void
  onNavigate: (page: NavPage) => void
  openProvider: (id: string) => void
  message: () => void
  manage: () => void
  bookAgain?: () => void
}) {
  const cancelled = booking.status === "cancelled"
  return (
    <div className="screen main-page">
      <main className="screen-scroll main-page-content plan-details-page">
        <PageHeader back={back} title="Plan details" />
        <section className="plan-status-card">
          <span className="status-label">{booking.statusLabel}</span>
          <h2>{booking.title}</h2>
          <p>{booking.subtitle}</p>
        </section>
        <BookingDetailSections
          booking={booking}
          onCalendarAdded={onCalendarAdded}
          openProvider={openProvider}
          page
        />
        <div className="plan-details-actions">
          <Button onClick={message} variant="secondary">
            Message helpers
          </Button>
          {cancelled ? (
            bookAgain && <Button onClick={bookAgain}>Book again</Button>
          ) : (
            <Button onClick={manage}>Manage booking</Button>
          )}
        </div>
      </main>
      <MainNavigation active="tasks" onNavigate={onNavigate} taskNotice />
    </div>
  )
}

function MessagesInbox({
  back,
  openThread,
  onNavigate,
  origin,
  bookings,
}: {
  back: () => void
  openThread: (bookingId: string | null) => void
  bookings: Booking[]
  onNavigate: (page: NavPage) => void
  origin: "tasks" | "saved"
}) {
  return (
    <div className="screen main-page">
      <main className="screen-scroll main-page-content">
        <PageHeader back={back} title="Messages" />
        <section className="conversation-list">
          {bookings.map((booking) => (
            <button
              key={booking.id}
              onClick={() => openThread(booking.id)}
              type="button"
            >
              <span className="conversation-avatars">
                {booking.helperIds.map((id) => (
                  <img alt={providerName(id)} key={id} src={helperPhotos[id]} />
                ))}
              </span>
              <span>
                <strong>{booking.helperIds.map(providerName).join(" & ")}</strong>
                <small>
                  {booking.title} · {booking.date}
                </small>
                <span>Your booking is confirmed.</span>
              </span>
              <Icon name="chevron" size={17} />
            </button>
          ))}
          <button onClick={() => openThread(null)} type="button">
            <span className="conversation-avatars">
              <img alt="Maria G." src={helperPhotos.maria} />
              <img alt="Jasmine R." src={helperPhotos.jasmine} />
            </span>
            <span>
              <strong>Maria G. &amp; Jasmine R.</strong>
              <small>Preparing for guests · Saturday, October 24</small>
              <span>Your service plan is confirmed.</span>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        </section>
      </main>
      <MainNavigation active={origin} onNavigate={onNavigate} taskNotice />
    </div>
  )
}

function HelpersMessageThread({
  back,
  onNavigate,
  origin,
  openProvider,
  booking,
}: {
  booking: Booking | null
  back: () => void
  onNavigate: (page: NavPage) => void
  origin: "tasks" | "saved"
  openProvider: (id: string) => void
}) {
  const [draft, setDraft] = useState("")
  const [sentMessages, setSentMessages] = useState<string[]>([])
  const send = () => {
    if (!draft.trim()) return
    setSentMessages((current) => [...current, draft.trim()])
    setDraft("")
  }

  return (
    <div className="screen main-page">
      <main className="screen-scroll thread-content">
        <header className="thread-header">
          <Button ariaLabel="Back to messages" onClick={back} variant="icon">
            <Icon name="arrow-left" />
          </Button>
          <button
            aria-label="Open helper profile"
            className="conversation-avatars thread-avatar-button"
            onClick={() => openProvider(booking?.helperIds[0] ?? "maria")}
            type="button"
          >
            {(booking?.helperIds ?? ["maria", "jasmine"]).map((id) => (
              <img alt={providerName(id)} key={id} src={helperPhotos[id]} />
            ))}
          </button>
          <div>
            <button
              className="thread-provider-name"
              onClick={() => openProvider(booking?.helperIds[0] ?? "maria")}
              type="button"
            >
              {booking
                ? booking.helperIds.map(providerName).join(" & ")
                : "Maria G. & Jasmine R."}
            </button>
            <p>
              {booking
                ? `${booking.title} · ${booking.date}`
                : "Your Service Plan · Saturday, October 24"}
            </p>
          </div>
        </header>
        <div className="thread-history">
          <span className="thread-date">
            {booking ? booking.date : "Saturday, October 24"}
          </span>
          {booking ? (
            <div className="thread-message incoming">
              <strong>{providerName(booking.helperIds[0]).split(" ")[0]}</strong>
              <p>
                Hi! I’m confirmed for {booking.title} on{" "}
                {weekdayOf(booking.date)}. Is there anything I should know
                beforehand?
              </p>
            </div>
          ) : (
            <>
              <div className="thread-message incoming">
                <strong>Maria</strong>
                <p>
                  Your service plan is confirmed. We’ll coordinate everything
                  here.
                </p>
              </div>
              <div className="thread-message outgoing">
                <p>Thank you. I’ll have the groceries ready.</p>
              </div>
              <div className="thread-message incoming">
                <strong>Jasmine</strong>
                <p>
                  Perfect. I’ll bring the organization and cleaning supplies.
                </p>
              </div>
            </>
          )}
          {sentMessages.map((message, index) => (
            <div
              className="thread-message outgoing"
              key={`${message}-${index}`}
            >
              <p>{message}</p>
            </div>
          ))}
        </div>
      </main>
      <div className="thread-composer">
        <Button
          ariaLabel="Add a photo"
          onClick={() =>
            setSentMessages((current) => [...current, "Photo attached"])
          }
          variant="icon"
        >
          <Icon name="camera" size={19} />
        </Button>
        <input
          aria-label="Write a message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send()
          }}
          placeholder="Write a message…"
          value={draft}
        />
        <Button disabled={!draft.trim()} onClick={send}>
          Send
        </Button>
      </div>
      <MainNavigation active={origin} onNavigate={onNavigate} taskNotice />
    </div>
  )
}

function TaskDetailsPage({
  task,
  back,
  openMessages,
}: {
  task: string
  back: () => void
  openMessages: () => void
}) {
  const [manageOpen, setManageOpen] = useState(false)
  const guest = task === "guest"
  const title =
    task === "tailoring"
      ? "Tailoring Service"
      : task === "organization"
        ? "Home Organization"
        : task === "meal-prep"
          ? "Weekly Meal Preparation"
          : "Your Service Plan"

  return (
    <div className="screen">
      <main className="screen-scroll detail-page-content">
        <PageHeader back={back} title="Task details" />
        <section className="detail-hero-card">
          <span className="status-label">
            {guest || task === "tailoring" ? "Upcoming" : "Completed"}
          </span>
          <h2>{title}</h2>
        </section>

        <section className="detail-list">
          <div>
            <h3>Schedule</h3>
            <p>
              {guest
                ? "Saturday, October 24"
                : task === "tailoring"
                  ? "Thursday, October 22"
                  : "Completed"}
              <br />
              {guest
                ? "10:00 AM–4:00 PM"
                : task === "tailoring"
                  ? "4:00 PM"
                  : "Previous booking"}
            </p>
          </div>
          <div>
            <h3>Address</h3>
            <p>
              123 W 12th St
              <br />
              New York, NY 10011
            </p>
          </div>
          <div>
            <h3>{guest ? "Helpers" : "Provider"}</h3>
            <p>
              {guest ? (
                <>
                  Maria G.
                  <br />
                  Jasmine R.
                </>
              ) : task === "tailoring" ? (
                "Clara W."
              ) : task === "organization" ? (
                "Jasmine R."
              ) : (
                "Maria G."
              )}
            </p>
          </div>
          <div>
            <h3>Tasks</h3>
            <ul>
              {(guest ? tasks : [title]).map((item) => (
                <li key={item}>
                  <Icon name="check" size={15} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="detail-price">
            <h3>Price</h3>
            <strong>Estimated total: {guest ? "$344" : "$86"}</strong>
          </div>
        </section>
      </main>
      <div className="dual-bottom-action">
        <Button onClick={openMessages} variant="secondary">
          {guest ? "Message helpers" : "Message"}
        </Button>
        <Button onClick={() => setManageOpen(true)}>Manage booking</Button>
      </div>
      {manageOpen && (
        <div className="composer-overlay">
          <button
            aria-label="Close booking management"
            className="sheet-scrim"
            onClick={() => setManageOpen(false)}
            type="button"
          />
          <section className="manage-sheet">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h2>Manage booking</h2>
              <Button
                ariaLabel="Close"
                className="sheet-close"
                onClick={() => setManageOpen(false)}
                variant="icon"
              >
                <Icon name="x" />
              </Button>
            </div>
            {[
              "Change date or time",
              "Update entry instructions",
              "Cancel booking",
            ].map((action) => (
              <button
                className={action === "Cancel booking" ? "danger-row" : ""}
                key={action}
                onClick={() => setManageOpen(false)}
                type="button"
              >
                <span>{action}</span>
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}

function TaskDetailsSheet({
  task,
  close,
  openMessages,
  bookAgain,
  openProvider,
  booking,
  manage,
  onCalendarAdded,
}: {
  onCalendarAdded: () => void
  task: string
  close: () => void
  openMessages: () => void
  bookAgain: (request: string) => void
  openProvider: (id: string) => void
  booking?: Booking
  manage: () => void
}) {
  const swipe = useSwipeDown(close)
  const guest = task === "guest"
  const upcoming = guest || task === "tailoring"
  const title =
    task === "tailoring"
      ? "Tailoring Service"
      : task === "organization"
        ? "Home Organization"
        : task === "meal-prep"
          ? "Weekly Meal Preparation"
          : "Your Service Plan"
  return (
    <div className="overlay-layer">
      <button
        aria-label="Close task details"
        className="overlay-scrim"
        onClick={close}
        type="button"
      />
      <section className="large-detail-sheet task-detail-sheet" {...swipe}>
        <div className="task-detail-scroll">
          <div className="sheet-handle" />
          <div className="overlay-heading">
            <div>
              <span className="status-label">
                {guest
                  ? "Upcoming"
                  : task === "tailoring"
                    ? (booking?.homeLabel ?? booking?.statusLabel ?? "In 13 hours")
                    : "Completed"}
              </span>
              <h2>{title}</h2>
            </div>
            <Button
              ariaLabel="Close task details"
              className="plain-close"
              onClick={close}
              variant="icon"
            >
              <Icon name="x" />
            </Button>
          </div>
          {booking ? (
            <BookingDetailSections
              booking={booking}
              onCalendarAdded={onCalendarAdded}
              openProvider={openProvider}
            />
          ) : upcoming ? (
            <div className="sheet-detail-grid">
              <div>
                <span>Date and time</span>
                <strong>
                  {guest
                    ? "Saturday, October 24 · 10:00 AM–4:00 PM"
                    : "Thursday, October 22 · 4:00 PM"}
                </strong>
              </div>
              <div>
                <span>{guest ? "Helpers" : "Provider"}</span>
                <button
                  className="detail-provider-link"
                  onClick={() =>
                    openProvider(task === "tailoring" ? "clara" : "maria")
                  }
                  type="button"
                >
                  <img
                    alt=""
                    src={helperPhotos[task === "tailoring" ? "clara" : "maria"]}
                  />
                  <strong>
                    {task === "tailoring"
                      ? "Clara W."
                      : "Maria G. · Jasmine R."}
                  </strong>
                </button>
              </div>
              <div>
                <span>Tasks</span>
                <strong>
                  {task === "tailoring" ? "2 garments" : "3 coordinated tasks"}
                </strong>
              </div>
              <div>
                <span>Address</span>
                <strong>123 W 12th St, New York, NY 10011</strong>
              </div>
            </div>
          ) : (
            <div className="past-booking-summary">
              <section>
                <h3>Booking</h3>
                <dl>
                  <div>
                    <dt>Booked on</dt>
                    <dd>September 28, 2026</dd>
                  </div>
                  <div>
                    <dt>Service date</dt>
                    <dd>October 8, 2026</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>1:00–3:30 PM</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>2.5 hours</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3>Helper</h3>
                <button
                  className="past-helper-row"
                  onClick={() =>
                    openProvider(task === "organization" ? "jasmine" : "maria")
                  }
                  type="button"
                >
                  <img
                    alt=""
                    src={
                      helperPhotos[
                        task === "organization" ? "jasmine" : "maria"
                      ]
                    }
                  />
                  <span>
                    <strong>
                      {task === "organization" ? "Jasmine R." : "Maria G."}
                    </strong>
                    <small>
                      {task === "organization"
                        ? "Home Organization"
                        : "Meal Preparation"}
                    </small>
                    <small>{task === "organization" ? "4.8 ★" : "4.9 ★"}</small>
                  </span>
                  <Icon name="chevron" size={17} />
                </button>
              </section>
              <section>
                <h3>Service</h3>
                <ul>
                  {(task === "organization"
                    ? [
                        "Closet organization",
                        "Cabinet organization",
                        "Living room reset",
                      ]
                    : [
                        "Weekly meal preparation",
                        "Ingredient organization",
                        "Kitchen reset",
                      ]
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Payment</h3>
                <dl>
                  <div>
                    <dt>Service</dt>
                    <dd>$112</dd>
                  </div>
                  <div>
                    <dt>Service fee</dt>
                    <dd>$18</dd>
                  </div>
                  <div className="past-total">
                    <dt>Total paid</dt>
                    <dd>$130</dd>
                  </div>
                  <div>
                    <dt>Payment method</dt>
                    <dd>Apple Pay</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3>Your review</h3>
                <div className="past-review">
                  <strong>5 ★</strong>
                  <p>“Everything was organized clearly and thoughtfully.”</p>
                </div>
              </section>
            </div>
          )}
        </div>
        <div className="task-sheet-actions">
          <Button
            ariaLabel={guest ? "Message helpers" : "Message provider"}
            className="quiet-message-action"
            onClick={openMessages}
            variant="text"
          >
            <Icon name="message" size={22} />
          </Button>
          {upcoming ? (
            <Button
              className="compact-manage-action"
              onClick={manage}
              variant="secondary"
            >
              Manage booking
            </Button>
          ) : (
            <Button
              className="compact-manage-action"
              onClick={() => {
                close()
                bookAgain(
                  task === "organization"
                    ? "I need help organizing my home."
                    : "I need weekly meal preparation for my home.",
                )
              }}
              variant="secondary"
            >
              Book again
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

function ProviderProfileSheet({
  providerId,
  close,
  choose,
  message,
  remove,
  planContext = false,
  planTotal = "$326 total",
  assignedTask = "Meal preparation",
  actionLabel,
  availabilityLabel,
}: {
  actionLabel?: string
  availabilityLabel?: string
  providerId: string
  close: () => void
  choose: () => void
  message: () => void
  remove: () => void
  planContext?: boolean
  planTotal?: string
  assignedTask?: string
}) {
  const provider =
    providers.find((item) => item.id === providerId) ?? providers[0]
  const swipe = useSwipeDown(close)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [tab, setTab] = useState<"about" | "availability" | "work" | "reviews">(
    "about",
  )
  const [selectedAvailabilityDay, setSelectedAvailabilityDay] = useState(14)
  const galleries: Record<string, string[]> = {
    clara: [
      "https://images.unsplash.com/photo-1710432104395-23e03b77e750?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1699570046899-dcd5bb4c803d?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1771440048248-f92cfdec51b3?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1771440048464-5ffc7d005142?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1612353407945-004f2caccd28?auto=format&fit=crop&w=700&q=80",
    ],
    jasmine: [
      "https://images.unsplash.com/photo-1778731660303-1fa5ede75477?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1791140842017-ff731195de5c?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1780672823738-2a8d15d79aaf?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1660295472734-031e091ba122?auto=format&fit=crop&w=700&q=80",
    ],
    maria: [
      "https://images.unsplash.com/photo-1636647511729-6703539ba71f?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1605522283494-4901a98d458e?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1656711829545-91481f306b88?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1744104135578-6768f2061be1?auto=format&fit=crop&w=700&q=80",
    ],
  }
  galleries.selin = [photoAt("Styling", 700), photoAt("At-home beauty services", 700)]
  galleries.dara = [photoAt("Eyebrow threading", 700), photoAt("At-home beauty services", 700)]
  const gallery = galleries[provider.id] ?? galleries.maria
  const isCook = ["maria", "nora", "elena", "sofia", "nina"].includes(provider.id)
  const isBeauty = provider.id === "selin" || provider.id === "dara"
  const introduction =
    provider.id === "clara"
      ? "I specialize in alterations and garment repairs from my home studio in New York. I work with everyday clothing, formalwear, and custom adjustments."
      : provider.id === "jasmine"
        ? "I create practical organizing systems that make busy homes easier to maintain, from closets to kitchens."
        : isBeauty
          ? "I offer relaxed at-home styling and beauty appointments across Manhattan and Brooklyn, and I bring everything we need."
          : "I prepare nourishing home-cooked meals and leave every kitchen clean, organized, and ready for the week."
  return (
    <div className="overlay-layer">
      <button
        aria-label="Close helper profile"
        className="overlay-scrim"
        onClick={close}
        type="button"
      />
      <section className="provider-profile-sheet" {...swipe}>
        <div className="sheet-handle" />
        <div className="overlay-heading">
          <h2>Helper profile</h2>
          <Button
            ariaLabel="Close helper profile"
            className="plain-close"
            onClick={close}
            variant="icon"
          >
            <Icon name="x" />
          </Button>
        </div>
        <div className="compact-profile-header">
          <img
            alt={provider.name}
            className="large-avatar profile-photo"
            src={helperPhotos[provider.id]}
          />
          <div>
            <h2>
              {provider.name} <Icon name="check" size={15} />
            </h2>
            <p>
              {provider.service} · {provider.rate}
            </p>
            <p>
              {provider.rating} ★ · {provider.completed} tasks
            </p>
            <p>{availabilityLabel ?? provider.availability}</p>
          </div>
          <div className="profile-header-actions">
            <Button ariaLabel="Save helper" onClick={remove} variant="text">
              <Icon name="saved" size={20} />
            </Button>
            <Button ariaLabel="Message helper" onClick={message} variant="text">
              <Icon name="message" size={20} />
            </Button>
          </div>
        </div>
        <div className="profile-tabs">
          {(["about", "availability", "work", "reviews"] as const).map(
            (item) => (
              <button
                className={tab === item ? "selected" : ""}
                key={item}
                onClick={() => setTab(item)}
                type="button"
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ),
          )}
        </div>
        <div className="profile-tab-content">
          {tab === "about" && (
            <>
              <p className="profile-introduction">{introduction}</p>
              <div className="profile-skill-tags">
                {provider.skills.slice(0, 3).map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              <div className="profile-service-list">
                {(provider.id === "clara"
                  ? [
                      ["Dress alterations", "From $38"],
                      ["Pants hemming", "From $24"],
                      ["Garment repair", "From $28"],
                    ]
                  : provider.id === "jasmine"
                    ? [
                        ["Closet organization", "From $45"],
                        ["Kitchen organization", "From $45"],
                        ["Storage systems", "From $52"],
                      ]
                    : isBeauty
                      ? [
                          ["Personal styling", "From $120"],
                          ["Eyebrow threading", "From $32"],
                          ["At-home beauty", "From $110"],
                        ]
                      : [
                        ["Weekly meal preparation", "From $42"],
                        ["Home-cooked meals", "From $48"],
                        ["Ingredient organization", "From $36"],
                      ]
                ).map(([service, price]) => (
                  <div key={service}>
                    <span>{service}</span>
                    <strong>{price}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "availability" && (
            <div className="profile-availability">
              <div className="profile-calendar-heading">
                <Icon name="arrow-left" size={17} />
                <strong>November 2026</strong>
                <Icon name="chevron" size={17} />
              </div>
              <div className="confirm-weekdays">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className="profile-calendar-grid">
                {Array.from({ length: 31 }, (_, index) => index + 1).map(
                  (day) => (
                    <button
                      className={`${
                        selectedAvailabilityDay === day ? "selected" : ""
                      } ${
                        [3, 7, 12, 18, 23, 29].includes(day)
                          ? "unavailable"
                          : ""
                      }`}
                      disabled={[3, 7, 12, 18, 23, 29].includes(day)}
                      key={day}
                      onClick={() => setSelectedAvailabilityDay(day)}
                      type="button"
                    >
                      {day}
                    </button>
                  ),
                )}
              </div>
              <div className="availability-ranges">
                <span>10:00 AM–1:00 PM</span>
                <span>1:00 PM–5:00 PM</span>
              </div>
            </div>
          )}
          {tab === "work" && (
            <div className="profile-work-grid">
              {gallery.map((photo, index) => (
                <button
                  aria-label={`Open work photo ${index + 1}`}
                  key={photo}
                  onClick={() => setViewerIndex(index)}
                  type="button"
                >
                  <img alt="" src={photo} />
                  <span>
                    {!isCook
                      ? "Completed work"
                      : index === 0
                      ? "Weekly preparation"
                      : index === 1
                        ? "Organized ingredients"
                        : "Completed work"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {tab === "reviews" && (
            <div className="profile-reviews">
              <div className="reviews-summary">
                <strong>{provider.rating} ★</strong>
                <span>48 reviews</span>
              </div>
              {[
                {
                  name: "Leah M.",
                  date: "October 12",
                  type: "Weekly meal preparation",
                  text: "Excellent communication and beautiful work. Everything was finished on time.",
                },
                {
                  name: "Sam R.",
                  date: "September 28",
                  type: "Home cooking",
                  text: "Reliable, thoughtful, and incredibly tidy. I would happily book again.",
                },
              ].map((review, index) => (
                <article key={review.name}>
                  <div>
                    <img
                      alt=""
                      src={
                        index === 0
                          ? "https://images.unsplash.com/photo-1604672840443-4f625b139ec5?auto=format&fit=crop&w=96&q=80"
                          : "https://images.unsplash.com/photo-1580241643463-fbfdecbaaeca?auto=format&fit=crop&w=96&q=80"
                      }
                    />
                    <span>
                      <strong>{review.name}</strong>
                      <small>★★★★★ · {review.date}</small>
                      <small>{isCook ? review.type : provider.service}</small>
                    </span>
                  </div>
                  <p>{review.text}</p>
                  {index === 0 && (
                    <button onClick={() => setViewerIndex(0)} type="button">
                      <img alt="Customer-uploaded work" src={gallery[0]} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
        <div className="provider-sheet-actions compact-profile-footer">
          <span>
            <strong>{planContext ? planTotal : provider.rate}</strong>
            <small>{planContext ? assignedTask : provider.availability}</small>
          </span>
          <Button onClick={choose}>
            {actionLabel ?? (planContext ? "Select this helper" : "Book this helper")}
          </Button>
        </div>
      </section>
      {viewerIndex !== null && (
        <div className="image-viewer">
          <Button
            ariaLabel="Close image viewer"
            onClick={() => setViewerIndex(null)}
            variant="text"
          >
            <Icon name="x" size={24} />
          </Button>
          <img alt="Expanded work" src={gallery[viewerIndex]} />
          <p className="image-viewer-description">
            {!isCook
              ? "Finished work photographed after the service."
              : viewerIndex === 0
              ? "A completed service prepared for the client’s week."
              : viewerIndex === 1
                ? "Carefully organized ingredients and a clean workspace."
                : "Finished work photographed after the service."}
          </p>
          <div>
            <Button
              disabled={viewerIndex === 0}
              onClick={() =>
                setViewerIndex((current) =>
                  current === null ? 0 : Math.max(0, current - 1),
                )
              }
              variant="text"
            >
              Previous
            </Button>
            <span>
              {viewerIndex + 1} of {gallery.length}
            </span>
            <Button
              disabled={viewerIndex === gallery.length - 1}
              onClick={() =>
                setViewerIndex((current) =>
                  current === null
                    ? 0
                    : Math.min(gallery.length - 1, current + 1),
                )
              }
              variant="text"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileDrawer({
  close,
  notify,
  openUIKit,
}: {
  close: () => void
  notify: (message: string) => void
  openUIKit: () => void
}) {
  const [section, setSection] = useState<string | null>(null)
  const sectionCopy: Record<string, ReactNode> = {
    "Personal information": (
      <>
        <strong>Iclal Yurdakok</strong>
        <span>iclal@example.com</span>
        <span>(212) 555-0194</span>
      </>
    ),
    "Saved addresses": (
      <>
        <strong>Home</strong>
        <span>123 W 12th St</span>
        <span>New York, NY 10011</span>
      </>
    ),
    "Payment methods": (
      <>
        <strong>Default payment</strong>
        <span>Card ending in 4242</span>
      </>
    ),
    Notifications: (
      <>
        <strong>Booking updates</strong>
        <span>Email and push notifications are on</span>
      </>
    ),
    "Help and safety": (
      <>
        <strong>Support</strong>
        <span>Help Center</span>
        <span>Safety and Trust</span>
      </>
    ),
    "Edit profile": (
      <>
        <label>
          First name
          <input defaultValue="Iclal" />
        </label>
        <label>
          Last name
          <input defaultValue="Yurdakok" />
        </label>
        <Button
          onClick={() => {
            notify("Profile updated")
            setSection(null)
          }}
        >
          Save Changes
        </Button>
      </>
    ),
  }
  return (
    <div className="drawer-layer">
      <button
        aria-label="Close profile"
        className="drawer-scrim"
        onClick={close}
        type="button"
      />
      <aside className="profile-drawer">
        <div className="drawer-top-actions">
          {section ? (
            <Button
              ariaLabel="Back to profile"
              className="plain-close"
              onClick={() => setSection(null)}
              variant="icon"
            >
              <Icon name="arrow-left" />
            </Button>
          ) : (
            <span />
          )}
          <Button
            ariaLabel="Close profile"
            className="plain-close"
            onClick={close}
            variant="icon"
          >
            <Icon name="x" />
          </Button>
        </div>
        {!section ? (
          <>
            <div className="drawer-account">
              <div className="large-avatar">IY</div>
              <h2>Iclal Yurdakok</h2>
              <p>iclal@example.com</p>
              <Button onClick={() => setSection("Edit profile")} variant="text">
                Edit profile
              </Button>
            </div>
            <div className="drawer-rows">
              {[
                "Personal information",
                "Saved addresses",
                "Payment methods",
                "Notifications",
                "Help and safety",
                "UI kit",
              ].map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    if (item === "UI kit") {
                      close()
                      openUIKit()
                    } else setSection(item)
                  }}
                  type="button"
                >
                  <span>{item}</span>
                  <Icon name="chevron" size={17} />
                </button>
              ))}
            </div>
            <Button
              className="drawer-logout"
              onClick={() => notify("Log out selected")}
              variant="secondary"
            >
              Log out
            </Button>
          </>
        ) : (
          <section className="drawer-detail">
            <h2>{section}</h2>
            {sectionCopy[section]}
          </section>
        )}
      </aside>
    </div>
  )
}

function SavedProviderCard({
  provider,
  remove,
  open,
  selectionMode = false,
  selected = false,
  select,
}: {
  provider: typeof providers[number]
  remove: () => void
  open: () => void
  selectionMode?: boolean
  selected?: boolean
  select?: () => void
}) {
  return (
    <article
      className={`saved-provider-card clickable-card ${
        selected ? "compare-selected" : ""
      }`}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) {
          if (selectionMode) select?.()
          else open()
        }
      }}
    >
      <div className="saved-provider-top">
        <img
          alt={provider.name}
          className="avatar avatar-photo"
          src={helperPhotos[provider.id]}
        />
        <div>
          <h2>{provider.name}</h2>
          <p>{provider.service}</p>
        </div>
        <BookmarkButton onClick={remove} saved />
      </div>
      <div className="saved-provider-meta">
        <span>
          <strong>{provider.rating}</strong> rating
        </span>
        <span>
          <strong>{provider.rate}</strong>
        </span>
        <span>{provider.availability}</span>
      </div>
      <div className="saved-card-actions">
        {selectionMode ? (
          <Button onClick={select} variant="secondary">
            {selected ? "Added ✓" : "Add to compare"}
          </Button>
        ) : (
          <Button onClick={open} variant="secondary">
            View Profile
          </Button>
        )}
      </div>
    </article>
  )
}

function SavedPage({
  savedProviders,
  toggleSaved,
  openProvider,
  customize,
  onNavigate,
  goHome,
  openInbox,
}: {
  savedProviders: string[]
  toggleSaved: (id: string) => void
  openProvider: (id: string) => void
  customize: (request: string) => void
  onNavigate: (page: NavPage) => void
  goHome: () => void
  openInbox: () => void
}) {
  const [tab, setTab] = useState<"helpers" | "plans">("helpers")
  const [filter, setFilter] = useState("All")
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const closeCompare = () => {
    setCompareOpen(false)
    setCompareMode(false)
    setCompareSelection([])
  }
  const compareSwipe = useSwipeDown(closeCompare)
  const visibleProviders = providers.filter((provider) => {
    if (!savedProviders.includes(provider.id)) return false
    if (filter === "All") return true
    return provider.service.includes(filter)
  })
  const toggleCompareSelection = (id: string) => {
    setCompareSelection((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length === 2) return current
      return [...current, id]
    })
  }
  const comparedProviders = compareSelection
    .map((id) => providers.find((provider) => provider.id === id))
    .filter((provider) => provider !== undefined)
  const chooseCompared = (id: string) => {
    closeCompare()
    openProvider(id)
  }

  return (
    <div className="screen main-page">
      <main className="screen-scroll main-page-content">
        <header className="saved-page-header">
          <div>
            <h1>Saved</h1>
          </div>
          <div className="saved-header-actions">
            <Button
              ariaLabel="Open messages"
              onClick={openInbox}
              variant="icon"
            >
              <Icon name="message" />
            </Button>
            {compareMode ? (
              <Button
                onClick={() => {
                  setCompareMode(false)
                  setCompareSelection([])
                }}
                variant="text"
              >
                Cancel
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setCompareMode(true)
                  setTab("helpers")
                  setFilter("Cooking")
                }}
                variant="secondary"
              >
                Compare
              </Button>
            )}
          </div>
        </header>
        <div className="saved-tabs">
          <button
            className={tab === "helpers" ? "selected" : ""}
            onClick={() => setTab("helpers")}
            type="button"
          >
            Helpers
          </button>
          <button
            className={tab === "plans" ? "selected" : ""}
            onClick={() => setTab("plans")}
            type="button"
          >
            Plans
          </button>
        </div>

        {tab === "helpers" && (
          <>
            <div className="filter-row">
              {["All", "Cooking", "Organization", "Tailoring"].map((item) => (
                <button
                  className={filter === item ? "selected" : ""}
                  key={item}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <section className="page-card-list">
              {visibleProviders.map((provider) => (
                <SavedProviderCard
                  key={provider.id}
                  open={() => openProvider(provider.id)}
                  provider={provider}
                  remove={() => toggleSaved(provider.id)}
                  select={() => toggleCompareSelection(provider.id)}
                  selected={compareSelection.includes(provider.id)}
                  selectionMode={compareMode}
                />
              ))}
              {visibleProviders.length === 0 && (
                <EmptyState
                  action="Browse help"
                  onAction={goHome}
                  text="Save helpers or plans while browsing so you can return to them later."
                  title="Nothing saved yet"
                />
              )}
            </section>
          </>
        )}

        {tab === "plans" && (
          <section className="page-card-list">
            <article className="saved-plan-card">
              <span className="status-label">Cooking</span>
              <h2>Weekly Meal Prep</h2>
              <Button
                onClick={() =>
                  customize(
                    "I need weekly meal preparation every Wednesday for approximately 3 hours.",
                  )
                }
                variant="secondary"
              >
                Customize
              </Button>
            </article>
            <article className="saved-plan-card">
              <span className="status-label">Multi-Service</span>
              <h2>Guest Ready Home</h2>
              <p>
                Meal preparation
                <br />
                Home reset
                <br />
                Organization
                <br />
                Starting around $240
              </p>
              <Button onClick={() => customize(request)} variant="secondary">
                Customize
              </Button>
            </article>
          </section>
        )}
      </main>
      <MainNavigation active="saved" onNavigate={onNavigate} />
      {compareMode && (
        <div className="compare-sticky-action">
          <span>
            {compareSelection.length === 2
              ? "2 selected"
              : compareSelection.length === 1
                ? "1 of 2 selected"
                : "Select two helpers"}
          </span>
          <Button
            disabled={compareSelection.length !== 2}
            onClick={() => {
              if (compareSelection.length === 2) setCompareOpen(true)
            }}
          >
            Compare
          </Button>
        </div>
      )}
      {compareOpen && (
        <div className="overlay-layer">
          <button
            aria-label="Close comparison"
            className="overlay-scrim"
            onClick={closeCompare}
            type="button"
          />
          <section className="comparison-sheet" {...compareSwipe}>
            <div className="sheet-handle" />
            <div className="overlay-heading">
              <h2>Compare</h2>
              <Button
                ariaLabel="Close comparison"
                className="plain-close"
                onClick={closeCompare}
                variant="icon"
              >
                <Icon name="x" />
              </Button>
            </div>
            <div className="comparison-scroll">
              <div className="comparison-summaries">
                {comparedProviders.map((provider) => (
                  <div key={provider.id}>
                    <h3>{provider.name}</h3>
                    <span>{provider.rating} rating</span>
                    <span>{provider.rate}</span>
                    <span>{provider.completed} tasks</span>
                    <span>{provider.availability}</span>
                  </div>
                ))}
              </div>
              <div className="comparison-categories">
                <div>
                  <strong>Experience</strong>
                  {comparedProviders.map((provider) => (
                    <span key={provider.id}>
                      {provider.name.split(" ")[0]}: {provider.completed}{" "}
                      {provider.service.toLowerCase()} tasks
                    </span>
                  ))}
                </div>
                <div>
                  <strong>Relevant skills</strong>
                  {comparedProviders.map((provider) => (
                    <span key={provider.id}>
                      {provider.name.split(" ")[0]}:{" "}
                      {provider.skills.slice(0, 2).join(" and ")}
                    </span>
                  ))}
                </div>
                <div>
                  <strong>Availability</strong>
                  {comparedProviders.map((provider) => (
                    <span key={provider.id}>
                      {provider.name.split(" ")[0]}:{" "}
                      {provider.availability.replace("Available ", "")}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="comparison-actions">
              {comparedProviders.map((provider) => (
                <Button
                  key={provider.id}
                  onClick={() => chooseCompared(provider.id)}
                >
                  Choose {provider.name.split(" ")[0]}
                </Button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function ProviderProfilePage({
  providerId,
  saved,
  toggleSaved,
  back,
  choose,
  message,
}: {
  providerId: string
  saved: boolean
  toggleSaved: () => void
  back: () => void
  choose: () => void
  message: () => void
}) {
  const provider =
    providers.find((item) => item.id === providerId) ?? providers[0]
  return (
    <div className="screen">
      <main className="screen-scroll provider-profile-content">
        <PageHeader back={back} title="Helper profile" />
        <section className="provider-profile-hero">
          <img
            alt={provider.name}
            className="large-avatar profile-photo"
            src={helperPhotos[provider.id]}
          />
          <div>
            <h2>{provider.name}</h2>
            <p>{provider.service}</p>
          </div>
          <BookmarkButton onClick={toggleSaved} saved={saved} />
        </section>
        <div className="profile-stat-grid">
          <div>
            <strong>{provider.rating}</strong>
            <span>Rating</span>
          </div>
          <div>
            <strong>{provider.completed}</strong>
            <span>Completed tasks</span>
          </div>
        </div>
        <section className="profile-info-list">
          <div>
            <h3>Verification</h3>
            <p>
              <Icon name="check" size={16} /> Background verified
            </p>
          </div>
          <div>
            <h3>Relevant skills</h3>
            <div className="skill-chips">
              {provider.skills.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          </div>
          <div>
            <h3>Next availability</h3>
            <p>{provider.availability}</p>
          </div>
          <div>
            <h3>Hourly rate</h3>
            <p>{provider.rate}</p>
          </div>
          <div>
            <h3>Why they match</h3>
            <p>{provider.match}</p>
          </div>
        </section>
      </main>
      <div className="dual-bottom-action">
        <Button onClick={message} variant="secondary">
          Message
        </Button>
        <Button onClick={choose}>Choose This Helper</Button>
      </div>
    </div>
  )
}

function ProfileRows({
  items,
  onSelect,
}: {
  items: string[]
  onSelect: (item: string) => void
}) {
  return (
    <div className="profile-rows">
      {items.map((item) => (
        <button key={item} onClick={() => onSelect(item)} type="button">
          <span>{item}</span>
          <Icon name="chevron" size={17} />
        </button>
      ))}
    </div>
  )
}

function ProfilePage({
  back,
  edit,
  addresses,
  notify,
}: {
  back: () => void
  edit: () => void
  addresses: () => void
  notify: (message: string) => void
}) {
  return (
    <div className="screen">
      <main className="screen-scroll profile-page-content">
        <PageHeader back={back} title="Profile" />
        <section className="account-summary">
          <div className="large-avatar">IY</div>
          <div>
            <h2>Iclal Yurdakok</h2>
            <p>iclal@example.com</p>
            <Button onClick={edit} variant="text">
              Edit Profile
            </Button>
          </div>
        </section>
        <section className="profile-section">
          <h3>Account</h3>
          <ProfileRows
            items={[
              "Personal Information",
              "Saved Addresses",
              "Payment methods",
              "Notifications",
            ]}
            onSelect={(item) =>
              item === "Personal Information"
                ? edit()
                : item === "Saved Addresses"
                  ? addresses()
                  : notify(`${item} selected`)
            }
          />
        </section>
        <section className="profile-section">
          <h3>Support</h3>
          <ProfileRows
            items={["Help Center", "Safety and Trust", "Terms and Privacy"]}
            onSelect={(item) => notify(`${item} selected`)}
          />
        </section>
        <Button
          className="logout-button"
          onClick={() => notify("Log out selected")}
          variant="secondary"
        >
          Log Out
        </Button>
      </main>
    </div>
  )
}

function EditProfilePage({
  back,
  save,
}: {
  back: () => void
  save: () => void
}) {
  return (
    <div className="screen">
      <main className="screen-scroll form-page-content">
        <PageHeader back={back} title="Edit Profile" />
        <div className="form-fields">
          {[
            ["First name", "Iclal"],
            ["Last name", "Yurdakok"],
            ["Email address", "iclal@example.com"],
            ["Phone number", "(212) 555-0194"],
          ].map(([label, value]) => (
            <label key={label}>
              <span>{label}</span>
              <input defaultValue={value} />
            </label>
          ))}
        </div>
      </main>
      <div className="stacked-bottom-action">
        <Button onClick={save}>Save Changes</Button>
        <Button onClick={back} variant="text">
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AddressesPage({
  back,
  notify,
}: {
  back: () => void
  notify: (message: string) => void
}) {
  return (
    <div className="screen">
      <main className="screen-scroll profile-page-content">
        <PageHeader back={back} title="Saved Addresses" />
        <article className="address-card">
          <h2>Home</h2>
          <p>
            123 W 12th St
            <br />
            New York, NY 10011
          </p>
          <div className="card-actions">
            <Button
              onClick={() => notify("Address editing opened")}
              variant="text"
            >
              Edit
            </Button>
            <Button onClick={() => notify("Address removed")} variant="text">
              Remove
            </Button>
          </div>
        </article>
        <Button
          className="add-address"
          onClick={() => notify("Add address selected")}
          variant="text"
        >
          <Icon name="plus" size={18} /> Add another address
        </Button>
      </main>
    </div>
  )
}

function MessagesPage({
  back,
  providerId,
}: {
  back: () => void
  providerId: string | null
}) {
  const provider = providers.find((item) => item.id === providerId)
  const [draft, setDraft] = useState("")
  const [sent, setSent] = useState<string[]>([])
  const send = () => {
    if (!draft.trim()) return
    setSent((current) => [...current, draft.trim()])
    setDraft("")
  }
  return (
    <div className="screen">
      <main className="screen-scroll message-page-content">
        <PageHeader
          back={back}
          subtitle={provider ? provider.service : "Maria G. and Jasmine R."}
          title={provider ? provider.name : "Your Service Plan"}
        />
        <div className="message-date">
          {provider ? "Today" : "Saturday, October 24"}
        </div>
        {provider ? (
          <div className="message-bubble incoming">
            <strong>{provider.name.split(" ")[0]}</strong>
            <p>Hi! Happy to help. What do you have in mind?</p>
          </div>
        ) : (
          <>
            <div className="message-bubble">
              <strong>Plan updates</strong>
              <p>
                This shared thread keeps messages for your complete plan in one
                place.
              </p>
            </div>
            <div className="message-bubble incoming">
              <strong>Maria</strong>
              <p>Looking forward to helping on Saturday.</p>
            </div>
          </>
        )}
        {sent.map((message, index) => (
          <div className="message-bubble" key={`${message}-${index}`}>
            <strong>You</strong>
            <p>{message}</p>
          </div>
        ))}
      </main>
      <div className="message-composer">
        <input
          aria-label="Write a message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send()
          }}
          placeholder="Write a message…"
          value={draft}
        />
        <Button disabled={!draft.trim()} onClick={send}>
          Send
        </Button>
      </div>
    </div>
  )
}

function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}

type RequestSection =
  | "tasks"
  | "date"
  | "time"
  | "location"
  | "access"
  | "ingredients"
  | `task:${string}`

const bookingPlans = {
  solo: {
    title: "One helper",
    badge: "Recommended",
    description: "One helper who can complete all three tasks.",
    people: "1 helper",
    duration: "Saturday, 11:00 AM–4:30 PM",
    schedule: "The simplest option with one arrival.",
    total: "$248 total",
  },
  team: {
    title: "Team of two",
    badge: "",
    description: "Two helpers finish your tasks faster.",
    people: "2 helpers",
    duration: "Saturday, 1:00–3:30 PM",
    schedule: "Meal preparation · Home reset",
    total: "$326 total",
  },
  split: {
    title: "Specialists",
    badge: "",
    description:
      "Specialists divide the tasks and complete the request sooner.",
    people: "3 specialists",
    duration: "Saturday, 2:00–4:00 PM",
    schedule: "Each task is assigned to a matching specialist.",
    total: "$384 total",
  },
} satisfies Record<PlanId, {
  title: string
  badge: string
  description: string
  people: string
  duration: string
  schedule: string
  total: string
}>

function FlowHeader({
  title,
  step,
  back,
}: {
  title: string
  step?: string
  back: () => void
}) {
  return (
    <header className="flow-header">
      <Button ariaLabel="Go back" onClick={back} variant="icon">
        <Icon name="arrow-left" />
      </Button>
      <div>
        {step && <span>{step}</span>}
        <h1>{title}</h1>
      </div>
    </header>
  )
}

function RequestAccordion({
  title,
  summary,
  eyebrow,
  required = false,
  section,
  active,
  setActive,
  children,
}: {
  title: string
  summary?: string
  /** Small line above the title, used for question counts. */
  eyebrow?: string
  /** Shows the needs-an-answer badge. */
  required?: boolean
  section: RequestSection
  active: RequestSection | null
  setActive: (section: RequestSection | null) => void
  children?: ReactNode
}) {
  const expanded = active === section
  return (
    <section
      className={`request-accordion ${expanded ? "expanded" : ""} ${
        required ? "needs-answer" : ""
      } ${eyebrow ? "question-row" : ""}`}
    >
      <button
        aria-expanded={expanded}
        className="accordion-heading"
        onClick={() => setActive(expanded ? null : section)}
        type="button"
      >
        <span>
          {eyebrow && <small className="accordion-eyebrow">{eyebrow}</small>}
          <strong>{title}</strong>
          {!eyebrow && !expanded && summary && <small>{summary}</small>}
        </span>
        <span className="accordion-trail">
          {required && (
            <span aria-label="Needs an answer" className="needs-answer-badge" role="img">
              <Icon name="alert" size={16} />
            </span>
          )}
          <Icon name={expanded ? "minus" : "chevron"} size={15} />
        </span>
      </button>
      {expanded && <div className="accordion-content">{children}</div>}
    </section>
  )
}

function YourRequestScreen({
  back,
  next,
  bookingTasks,
  setBookingTasks,
  date,
  setDate,
  time,
  setTime,
  address,
  setAddress,
}: {
  back: () => void
  next: () => void
  bookingTasks: string[]
  setBookingTasks: (tasks: string[]) => void
  date: string
  setDate: (value: string) => void
  time: string
  setTime: (value: string) => void
  address: string
  setAddress: (value: string) => void
}) {
  const [active, setActive] = useState<RequestSection | null>("tasks")
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [dateMode, setDateMode] = useState<"dates" | "flexible">("dates")
  const [flexWhen, setFlexWhen] = useState("")
  const [flexSoon, setFlexSoon] = useState("")
  const [hour, setHour] = useState("10")
  const [minute, setMinute] = useState("00")
  const [period, setPeriod] = useState("AM")
  const [timeFlexible, setTimeFlexible] = useState(time === "Anytime")
  const [addressDraft, setAddressDraft] = useState(address)
  const [loading, setLoading] = useState(false)
  const complete = bookingTasks.length > 0 && Boolean(date && time && address)
  const unavailableDays = [4, 8, 11, 15, 18, 22, 25, 29]

  const saveTask = (index: number) => {
    if (draft.trim()) {
      setBookingTasks(
        bookingTasks.map((task, taskIndex) =>
          taskIndex === index ? draft.trim() : task,
        ),
      )
    }
    setEditing(null)
  }

  const clearAll = () => {
    setBookingTasks([])
    setDate("")
    setTime("")
    setAddress(selectedAddressLabel)
    setAddressDraft(selectedAddressLabel)
    setActive("tasks")
  }

  return (
    <div className="screen booking-flow-screen">
      <FlowHeader back={back} title="Your request" />
      <main className="screen-scroll request-flow-content">
        <RequestAccordion
          active={active}
          section="tasks"
          setActive={setActive}
          summary={
            bookingTasks.length
              ? `${bookingTasks.length} task${
                  bookingTasks.length === 1 ? "" : "s"
                }`
              : "Add at least one task"
          }
          title="Tasks"
        >
          <div className="editable-task-list">
            {bookingTasks.map((task, index) => (
              <div className="editable-task" key={`${task}-${index}`}>
                <span className="task-saved">
                  <Icon name="check" size={14} />
                </span>
                {editing === index ? (
                  <input
                    aria-label={`Edit ${task}`}
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveTask(index)
                    }}
                    value={draft}
                  />
                ) : (
                  <span>{task}</span>
                )}
                <Button
                  ariaLabel={
                    editing === index ? `Save ${task}` : `Edit ${task}`
                  }
                  onClick={() => {
                    if (editing === index) saveTask(index)
                    else {
                      setDraft(task)
                      setEditing(index)
                    }
                  }}
                  variant="icon"
                >
                  <Icon name={editing === index ? "check" : "edit"} size={16} />
                </Button>
                <Button
                  ariaLabel={`Remove ${task}`}
                  onClick={() =>
                    setBookingTasks(
                      bookingTasks.filter(
                        (_, taskIndex) => taskIndex !== index,
                      ),
                    )
                  }
                  variant="icon"
                >
                  <Icon name="x" size={16} />
                </Button>
              </div>
            ))}
          </div>
          <div className="task-accordion-actions">
            <Button
              onClick={() => {
                const nextTasks = [...bookingTasks, "New task"]
                setBookingTasks(nextTasks)
                setDraft("New task")
                setEditing(nextTasks.length - 1)
              }}
              variant="secondary"
            >
              <Icon name="plus" size={17} /> Add another task
            </Button>
            <Button
              className="accordion-done tasks-accordion-done"
              disabled={!bookingTasks.length}
              onClick={() => setActive("date")}
            >
              Done
            </Button>
          </div>
        </RequestAccordion>

        <RequestAccordion
          active={active}
          section="date"
          setActive={setActive}
          summary={date || "Choose a date"}
          title="Date"
        >
          <div className="booking-tabs">
            <button
              className={dateMode === "dates" ? "selected" : ""}
              onClick={() => setDateMode("dates")}
              type="button"
            >
              Choose dates
            </button>
            <button
              className={dateMode === "flexible" ? "selected" : ""}
              onClick={() => setDateMode("flexible")}
              type="button"
            >
              Flexible
            </button>
          </div>
          {dateMode === "dates" ? (
            <div className="request-calendar">
              <strong>October 2026</strong>
              <div className="date-weekdays">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className="date-grid">
                {Array.from({ length: 4 }, (_, index) => (
                  <span key={`blank-${index}`} />
                ))}
                {Array.from({ length: 31 }, (_, index) => index + 1).map(
                  (day) => {
                    const unavailable = unavailableDays.includes(day)
                    return (
                      <button
                        aria-label={`October ${day}${
                          unavailable ? ", unavailable" : ""
                        }`}
                        className={`${
                          date === `Saturday, October ${day}` ? "selected" : ""
                        } ${unavailable ? "unavailable crossed" : ""}`}
                        disabled={unavailable}
                        key={day}
                        onClick={() => setDate(`Saturday, October ${day}`)}
                        type="button"
                      >
                        {day}
                      </button>
                    )
                  },
                )}
              </div>
            </div>
          ) : (
            <div className="flexible-date-options">
              <h3>When works best?</h3>
              <div className="booking-chips">
                {["Weekday", "Weekend", "Anytime"].map((option) => (
                  <button
                    className={flexWhen === option ? "selected" : ""}
                    key={option}
                    onClick={() => setFlexWhen(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
              <h3>How soon?</h3>
              <div className="booking-chips">
                {["This week", "Next week", "This month"].map((option) => (
                  <button
                    className={flexSoon === option ? "selected" : ""}
                    key={option}
                    onClick={() => setFlexSoon(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button
            className="accordion-done"
            disabled={dateMode === "dates" ? !date : !(flexWhen && flexSoon)}
            onClick={() => {
              if (dateMode === "flexible") setDate(`${flexWhen} · ${flexSoon}`)
              setActive("time")
            }}
            variant="secondary"
          >
            Done <Icon name="chevron" size={16} />
          </Button>
        </RequestAccordion>

        <RequestAccordion
          active={active}
          section="time"
          setActive={setActive}
          summary={time || "Choose a time"}
          title="Time"
        >
          <div className="time-card-heading">
            <span>Choose a start time</span>
            <label className="flex-toggle">
              <span>Flexible</span>
              <input
                checked={timeFlexible}
                onChange={(event) => setTimeFlexible(event.target.checked)}
                type="checkbox"
              />
              <i />
            </label>
          </div>
          <div
            className={`single-time-wheel ${timeFlexible ? "disabled" : ""}`}
          >
            <WheelColumn
              onSelect={setHour}
              selected={hour}
              values={[
                "8",
                "9",
                "10",
                "11",
                "12",
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
              ]}
            />
            <WheelColumn
              onSelect={setMinute}
              selected={minute}
              values={["00", "15", "30", "45"]}
            />
            <WheelColumn
              onSelect={setPeriod}
              selected={period}
              values={["AM", "PM"]}
            />
          </div>
          <Button
            className="accordion-done"
            onClick={() => {
              setTime(timeFlexible ? "Anytime" : `${hour}:${minute} ${period}`)
              setActive("location")
            }}
            variant="secondary"
          >
            Done <Icon name="chevron" size={16} />
          </Button>
        </RequestAccordion>

        <RequestAccordion
          active={active}
          section="location"
          setActive={setActive}
          summary={address || "Add service address"}
          title="Location"
        >
          <label className="location-editor">
            <span>Service address</span>
            <input
              autoFocus
              onChange={(event) => setAddressDraft(event.target.value)}
              value={addressDraft}
            />
          </label>
          <Button
            className="accordion-done"
            disabled={!addressDraft.trim()}
            onClick={() => {
              setAddress(addressDraft.trim())
              setActive("tasks")
            }}
            variant="secondary"
          >
            Save address
          </Button>
        </RequestAccordion>
        {!complete && (
          <p className="incomplete-note">
            Complete your tasks, date, time, and location to see plans.
          </p>
        )}
      </main>
      <div className="request-sticky-footer">
        <Button onClick={clearAll} variant="text">
          Clear all
        </Button>
        <Button
          disabled={!complete || loading}
          onClick={() => {
            setLoading(true)
            window.setTimeout(next, 650)
          }}
        >
          {loading ? "Loading plans…" : "Show plans"}
        </Button>
      </div>
    </div>
  )
}

function SelectionRow({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      aria-pressed={selected}
      className={`selection-row ${selected ? "selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span>{label}</span>
      <span className="selection-check">
        {selected && <Icon name="check" size={15} />}
      </span>
    </button>
  )
}

const WHEEL_ROW = 34

function ScrollWheel({
  values,
  value,
  onChange,
  label,
}: {
  values: string[]
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const settle = useRef<number | undefined>(undefined)
  const lockUntil = useRef(0)
  const selectedIndex = Math.max(0, values.indexOf(value))
  const [center, setCenter] = useState(selectedIndex)

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = selectedIndex * WHEEL_ROW
    return () => window.clearTimeout(settle.current)
  }, [])

  const handleScroll = () => {
    const element = scroller.current
    if (!element) return
    const index = Math.min(
      values.length - 1,
      Math.max(0, Math.round(element.scrollTop / WHEEL_ROW)),
    )
    setCenter(index)
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      if (Date.now() >= lockUntil.current && values[index] !== value) {
        onChange(values[index])
      }
    }, 120)
  }

  return (
    <div
      aria-label={label}
      className="ref-wheel-col"
      onScroll={handleScroll}
      ref={scroller}
    >
      <div className="ref-wheel-spacer" />
      {values.map((item, index) => {
        const distance = Math.min(Math.abs(index - center), 3)
        return (
          <button
            aria-pressed={item === value}
            className={`ref-wheel-item d${distance}`}
            key={item}
            onClick={() => {
              lockUntil.current = Date.now() + 450
              setCenter(index)
              scroller.current?.scrollTo({
                top: index * WHEEL_ROW,
                behavior: "smooth",
              })
              onChange(item)
            }}
            type="button"
          >
            {item}
          </button>
        )
      })}
      <div className="ref-wheel-spacer" />
    </div>
  )
}

function BookingFacts({
  datePreference,
  timePreference,
  hours,
  onDate,
  onTime,
  active = null,
}: {
  datePreference?: DatePreference
  timePreference?: TimePreference
  hours: number
  onDate: () => void
  onTime: () => void
  active?: RequestSection | null
}) {
  const dateInfo = describeDate(datePreference)
  const timeInfo = describeTime(timePreference)
  const end =
    timePreference?.kind === "exact" ? clockParts(timePreference.hour + hours) : null
  return (
    <section className="ref-facts">
      <button
        aria-expanded={active === "date"}
        aria-label="Edit date"
        className={active === "date" ? "active" : ""}
        onClick={onDate}
        type="button"
      >
        <small>Date</small>
        <strong>{dateInfo.primary}</strong>
        <span>{dateInfo.secondary}</span>
      </button>
      <button
        aria-expanded={active === "time"}
        aria-label="Edit time"
        className={active === "time" ? "active" : ""}
        onClick={onTime}
        type="button"
      >
        <small>Time</small>
        <strong>{timeInfo.primary}</strong>
        <span>{end ? `Ends around ${end.label} ${end.period}` : timeInfo.secondary}</span>
      </button>
    </section>
  )
}

function ConfirmDetailsScreen({
  back,
  next,
  bookingTasks,
  setBookingTasks,
  address,
  setAddress,
  access,
  setAccess,
  ingredients,
  setIngredients,
  date,
  setDate,
  time,
  setTime,
  service,
  initialSection,
  returning,
  request,
  plannedHours,
  priceChange,
  onAddTasks,
  onAnswer,
  onClarify,
  onDateWindow,
}: {
  service: ServiceInfo | null
  initialSection: RequestSection | null
  returning: boolean
  request: ServiceRequest
  plannedHours: number
  priceChange: PriceChange | null
  onAddTasks: (text: string) => void
  onAnswer: (taskId: string, questionId: string, value: string) => void
  onClarify: (option: ClarificationOption) => void
  onDateWindow: (date: DatePreference) => void
  back: () => void
  next: () => void
  bookingTasks: string[]
  setBookingTasks: (tasks: string[]) => void
  address: string
  setAddress: (value: string) => void
  access: string
  setAccess: (value: string) => void
  ingredients: string
  setIngredients: (value: string) => void
  date: string
  setDate: (value: string) => void
  time: string
  setTime: (value: string) => void
}) {
  const pickedIso =
    request.datePreference?.kind === "specific" ? request.datePreference.date : null
  const pickedDate = pickedIso ? fromIso(pickedIso) : new Date(2026, 10, 14)
  const dateFlexible =
    request.datePreference?.kind === "flexible" ||
    (request.datePreference?.kind === "window" && request.datePreference.flexible)
  const [dateTab, setDateTab] = useState<"calendar" | "flexible">(
    dateFlexible ? "flexible" : "calendar",
  )
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState("")
  const [active, setActive] = useState<RequestSection | null>(initialSection)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [apartmentNote, setApartmentNote] = useState("")
  const [month, setMonth] = useState(pickedDate.getMonth())
  const [loading, setLoading] = useState(false)
  const openQuestions = service ? 0 : openRequiredCount(request)
  const complete =
    bookingTasks.length > 0 &&
    Boolean(address && access && ingredients && date && time) &&
    !request.clarification &&
    openQuestions === 0
  const option = service ? serviceOption(service) : categoryOptions.food
  const duration = service?.hours ?? plannedHours
  const showAccess = Boolean(service) || needsHomeAccess(request)
  const showOption = Boolean(service) || includesMeals(request)
  const submitAdd = () => {
    if (!addDraft.trim()) return
    onAddTasks(addDraft)
    setAddDraft("")
    setAdding(false)
  }
  const flexible = time === "Flexible time"
  const startValue = parseRangeStart(time)
  const [clock, setClock] = useState(startValue ?? 13)
  const clockHour = Math.floor(clock)
  const hourValue = String(clockHour % 12 || 12)
  const minuteValue = String(Math.round((clock - clockHour) * 60)).padStart(2, "0")
  const periodValue = clockHour >= 12 ? "PM" : "AM"
  const setClockParts = (hour: string, minute: string, period: string) => {
    const value = (Number(hour) % 12) + (period === "PM" ? 12 : 0) + Number(minute) / 60
    setClock(value)
    setTime(formatRange(value, duration))
  }
  const finish = clockParts(clock + duration)
  const taskCount = `${bookingTasks.length} task${
    bookingTasks.length === 1 ? "" : "s"
  }`

  const saveTask = (index: number) => {
    if (draft.trim()) {
      setBookingTasks(
        bookingTasks.map((task, itemIndex) =>
          itemIndex === index ? draft.trim() : task,
        ),
      )
    }
    setEditing(null)
  }
  const monthDate = new Date(2026, month, 1)
  const monthLabel = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
  const daysInMonth = new Date(2026, month + 1, 0).getDate()
  const leadingDays = monthDate.getDay()
  const todayDate = fromIso(TODAY)
  const isPast = (day: number) => new Date(2026, month, day) < todayDate
  const flexibleOptions = flexibleDateOptions()
  const flexibleLabel =
    request.datePreference?.kind === "window" ? request.datePreference.label : ""
  const doneButton = (
    <Button
      onClick={() => {
        if (active === "time" && !time) setTime(formatRange(clock, duration))
        setActive(null)
      }}
      variant="text"
    >
      Done
    </Button>
  )

  return (
    <div className="screen booking-flow-screen">
      <FlowHeader back={back} step="1 of 3" title="Confirm details" />
      <main className="screen-scroll request-flow-content confirm-content">
        <p className="flow-supporting-copy">
          {service ? `Prefilled for ${service.title}.` : "We filled this in from your request."}
        </p>
        {priceChange ? (
          <PriceChangeNote change={priceChange} />
        ) : (
          request.notices.map((notice) => (
            <p className="flow-supporting-copy" key={notice}>
              {notice}
            </p>
          ))
        )}
        {request.clarification && (
          <div className="plan-issue" role="status">
            <strong>{request.clarification.question}</strong>
            <div className="cd-chips">
              {request.clarification.options.map((item) => (
                <button
                  className="cd-chip"
                  key={item.label}
                  onClick={() => onClarify(item)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <BookingFacts
          active={active}
          datePreference={request.datePreference}
          hours={duration}
          onDate={() => setActive(active === "date" ? null : "date")}
          onTime={() => setActive(active === "time" ? null : "time")}
          timePreference={request.timePreference}
        />
        {active === "date" && (
          <div className="ref-panel date-panel">
            <div className="date-segments" role="tablist">
              {(["calendar", "flexible"] as const).map((tab) => (
                <button
                  aria-selected={dateTab === tab}
                  className={dateTab === tab ? "selected" : ""}
                  key={tab}
                  onClick={() => setDateTab(tab)}
                  role="tab"
                  type="button"
                >
                  {tab === "calendar" ? "Calendar" : "Flexible"}
                </button>
              ))}
            </div>
            {dateTab === "flexible" ? (
              <>
                <p className="date-flex-intro">Any day in the range works. Your helper confirms the day.</p>
                <div className="date-flex-grid">
                  {flexibleOptions.map((item) => (
                    <button
                      aria-pressed={dateFlexible && flexibleLabel === item.value.label}
                      className={
                        dateFlexible && flexibleLabel === item.value.label ? "selected" : ""
                      }
                      key={item.title}
                      onClick={() => {
                        onDateWindow(item.value)
                        setActive(null)
                      }}
                      type="button"
                    >
                      <strong>{item.title}</strong>
                      <small>{item.range}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
            <>
            <div className="confirm-calendar-heading">
              <Button
                ariaLabel="Previous month"
                disabled={month <= todayDate.getMonth()}
                onClick={() => setMonth((current) => current - 1)}
                variant="text"
              >
                <Icon name="arrow-left" size={18} />
              </Button>
              <strong>{monthLabel}</strong>
              <Button
                ariaLabel="Next month"
                onClick={() => setMonth((current) => current + 1)}
                variant="text"
              >
                <Icon name="chevron" size={18} />
              </Button>
            </div>
            <div className="confirm-weekdays">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <span key={`${day}-${index}`}>{day}</span>
              ))}
            </div>
            <div className="confirm-calendar-grid">
              {Array.from({ length: leadingDays }, (_, index) => (
                <span key={`blank-${index}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
                (day) => {
                  const past = isPast(day)
                  const selected =
                    Boolean(pickedIso) &&
                    month === pickedDate.getMonth() &&
                    day === pickedDate.getDate()
                  const today =
                    month === todayDate.getMonth() && day === todayDate.getDate()
                  return (
                    <button
                      aria-current={today ? "date" : undefined}
                      className={`${selected ? "selected" : ""} ${past ? "past" : ""} ${
                        today ? "is-today" : ""
                      }`}
                      disabled={past}
                      key={day}
                      onClick={() => {
                        setDate(
                          new Date(2026, month, day).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          }),
                        )
                        setActive(null)
                      }}
                      type="button"
                    >
                      {day}
                    </button>
                  )
                },
              )}
            </div>
            </>
            )}
            <div className="cd-actions cd-actions--end">{doneButton}</div>
          </div>
        )}
        {active === "time" && (
          <div className="ref-panel">
            <label className="ref-toggle">
              <span>
                <strong>Flexible time</strong>
                <small>Your helper will confirm a time with you</small>
              </span>
              <input
                aria-label="Flexible time"
                checked={flexible}
                onChange={(event) =>
                  setTime(
                    event.target.checked
                      ? "Flexible time"
                      : formatRange(clock, duration),
                  )
                }
                type="checkbox"
              />
              <i />
            </label>
            {!flexible && (
              <div className="ref-wheel">
                <ScrollWheel
                  label="Hour"
                  onChange={(item) => setClockParts(item, minuteValue, periodValue)}
                  value={hourValue}
                  values={["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]}
                />
                <span className="ref-wheel-colon">:</span>
                <ScrollWheel
                  label="Minute"
                  onChange={(item) => setClockParts(hourValue, item, periodValue)}
                  value={minuteValue}
                  values={["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]}
                />
                <ScrollWheel
                  label="AM or PM"
                  onChange={(item) => setClockParts(hourValue, minuteValue, item)}
                  value={periodValue}
                  values={["AM", "PM"]}
                />
              </div>
            )}
            <div className="cd-actions">
              <small>
                {flexible
                  ? "No time needed for now"
                  : `Ends around ${finish.label} ${finish.period}`}
              </small>
              {doneButton}
            </div>
          </div>
        )}
        <RequestAccordion
          active={active}
          section="tasks"
          setActive={setActive}
          summary={bookingTasks.join(", ") || "Add a task"}
          title="What"
        >
          <div className="editable-task-list">
            {bookingTasks.map((task, index) => (
              <div className="editable-task" key={`${task}-${index}`}>
                {editing === index ? (
                  <input
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveTask(index)
                    }}
                    value={draft}
                  />
                ) : (
                  <span>{task}</span>
                )}
                <Button
                  ariaLabel={`Edit ${task}`}
                  onClick={() => {
                    if (editing === index) saveTask(index)
                    else {
                      setDraft(task)
                      setEditing(index)
                    }
                  }}
                  variant="text"
                >
                  <Icon name={editing === index ? "check" : "edit"} size={16} />
                </Button>
                <Button
                  ariaLabel={`Remove ${task}`}
                  onClick={() =>
                    setBookingTasks(
                      bookingTasks.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                  variant="text"
                >
                  <Icon name="x" size={16} />
                </Button>
              </div>
            ))}
          </div>
          {adding && (
            <div className="add-task-field">
              <input
                aria-label="Describe what to add"
                autoFocus
                onChange={(event) => setAddDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitAdd()
                  if (event.key === "Escape") {
                    setAddDraft("")
                    setAdding(false)
                  }
                }}
                placeholder="e.g. Clean the kitchen cabinets"
                value={addDraft}
              />
              <button
                aria-label="Add to request"
                className="add-task-submit"
                disabled={!addDraft.trim()}
                onClick={submitAdd}
                type="button"
              >
                <Icon name="check" size={18} />
              </button>
            </div>
          )}
          <div className="cd-actions">
            {adding ? (
              <Button
                onClick={() => {
                  setAddDraft("")
                  setAdding(false)
                }}
                variant="text"
              >
                Cancel
              </Button>
            ) : (
              <Button onClick={() => setAdding(true)} variant="text">
                <Icon name="plus" size={15} /> Add task
              </Button>
            )}
            {doneButton}
          </div>
        </RequestAccordion>
        {!service &&
          request.tasks.map((task) => {
            const open = questionsForTask(task)
            const shown = requiredQuestions(task)
            if (shown.length === 0) return null
            return (
              <RequestAccordion
                active={active}
                eyebrow={
                  open.length === 0
                    ? "All set"
                    : `${open.length} question${open.length === 1 ? "" : "s"}`
                }
                key={task.id}
                required={open.length > 0}
                section={`task:${task.id}`}
                setActive={setActive}
                title={task.title}
              >
                {shown.map((question) => (
                  <div className="cd-question" key={question.id}>
                    <small>{question.label}</small>
                    <div className="cd-chips">
                      {question.options.map((value) => (
                        <button
                          aria-pressed={task.answers[question.id] === value}
                          className={`cd-chip ${
                            task.answers[question.id] === value ? "selected" : ""
                          }`}
                          key={value}
                          onClick={() => onAnswer(task.id, question.id, value)}
                          type="button"
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="cd-actions cd-actions--end">{doneButton}</div>
              </RequestAccordion>
            )
          })}
        <RequestAccordion
          active={active}
          section="location"
          setActive={setActive}
          summary={address}
          title="Where"
        >
          <label className="location-editor">
            <span>Service address</span>
            <input
              onChange={(event) => setAddress(event.target.value)}
              value={address}
            />
          </label>
          <label className="location-editor">
            <span>Apartment or access note (optional)</span>
            <input
              onChange={(event) => setApartmentNote(event.target.value)}
              placeholder="Apartment 4B, call on arrival"
              value={apartmentNote}
            />
          </label>
          <div className="cd-actions cd-actions--end">{doneButton}</div>
        </RequestAccordion>
        {showAccess && (
        <RequestAccordion
          active={active}
          section="access"
          setActive={setActive}
          summary={access}
          title="Access"
        >
          <div className="cd-chips">
            {["Doorman", "Smart-lock code", "Lockbox", "Arrange later"].map(
              (item) => (
                <button
                  aria-pressed={access === item}
                  className={`cd-chip ${access === item ? "selected" : ""}`}
                  key={item}
                  onClick={() => {
                    setAccess(item)
                    setActive(null)
                  }}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}
          </div>
        </RequestAccordion>
        )}
        {showOption && (
        <RequestAccordion
          active={active}
          section="ingredients"
          setActive={setActive}
          summary={ingredients}
          title={option.title}
        >
          <div className="cd-chips">
            {option.options.map((item) => (
              <button
                aria-pressed={ingredients === item}
                className={`cd-chip ${ingredients === item ? "selected" : ""}`}
                key={item}
                onClick={() => {
                  setIngredients(item)
                  setActive(null)
                }}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </RequestAccordion>
        )}
      </main>
      <div className="warm-sticky-footer confirm-footer">
        <span>
          <strong>{taskCount}</strong>
          <small className={openQuestions ? "needs-answer-note" : ""}>
            {openQuestions
              ? `Answer ${openQuestions} question${openQuestions === 1 ? "" : "s"} to see plans`
              : date
                ? weekdayOf(date)
                : "Set a date"}
          </small>
        </span>
        <Button
          disabled={!complete || loading}
          onClick={() => {
            if (returning) {
              next()
              return
            }
            setLoading(true)
            window.setTimeout(next, 600)
          }}
        >
          {returning ? "Back to review" : loading ? "Loading plans…" : "See plans"}
        </Button>
      </div>
    </div>
  )
}

function PriceLines({
  lines,
  total,
}: {
  lines: Array<{ label: string; amount: number }>
  total?: string
}) {
  return (
    <dl className="price-lines">
      {lines.map((line) => (
        <div key={line.label}>
          <dt>{line.label}</dt>
          <dd>${line.amount}</dd>
        </div>
      ))}
      {total && (
        <div className="price-lines-total">
          <dt>Total</dt>
          <dd>{total}</dd>
        </div>
      )}
    </dl>
  )
}

type PriceChange = {
  items: string[]
  total: number
  difference: number
}

function PriceChangeNote({ change }: { change: PriceChange }) {
  return (
    <p className="price-change" role="status">
      {[...change.items, change.difference !== 0 ? `New total: $${change.total}` : ""]
        .filter(Boolean)
        .join(" · ")}
      {change.difference !== 0 && (
        <span>
          {" "}
          {change.difference > 0 ? "+" : "−"}${Math.abs(change.difference)}
        </span>
      )}
    </p>
  )
}

function HelperMatchRow({
  id,
  role,
  onOpen,
}: {
  id: string
  role: string
  onOpen: (id: string) => void
}) {
  const provider = providers.find((item) => item.id === id)!
  return (
    <button
      aria-label={`View ${provider.name} profile`}
      className="match-helper"
      onClick={() => onOpen(id)}
      type="button"
    >
      <img alt="" src={helperPhotos[id]} />
      <span>
        <strong>
          {provider.name}
          {provider.verified && <Icon name="check" size={13} />}
        </strong>
        <small>
          ★ {provider.rating} · {role || provider.service}
        </small>
      </span>
    </button>
  )
}

/** Flexible date ranges offered next to the calendar. */
type DateWindow = Extract<DatePreference, { kind: "window" }>

function flexibleDateOptions(): Array<{ title: string; range: string; value: DateWindow }> {
  const monday = weekStart(TODAY)
  const sunday = addDays(monday, 6)
  const saturday = addDays(monday, 5)
  const friday = addDays(monday, 4)
  const monthEnd = toIso(new Date(2026, fromIso(TODAY).getMonth() + 1, 0))
  const short = (iso: string) =>
    fromIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const range = (start: string, end: string) => `${short(start)}–${fromIso(end).getDate()}`
  const window = (start: string, end: string, label: string): DateWindow => ({
    kind: "window",
    start,
    end,
    label,
    flexible: true,
  })
  return [
    { title: "This week", range: range(TODAY, sunday), value: window(TODAY, sunday, "This week") },
    { title: "This month", range: range(TODAY, monthEnd), value: window(TODAY, monthEnd, "This month") },
    { title: "Weekend", range: `Sat–Sun, ${range(saturday, sunday)}`, value: window(saturday, sunday, "This weekend") },
    { title: "Weekday", range: `Weekdays, ${range(TODAY, friday)}`, value: window(TODAY, friday, "Weekday this week") },
  ]
}

function compactDate(label: string) {
  return label.startsWith("By ") ? `By ${shortDate(label.slice(3))}` : shortDate(label)
}

/** Distance a swipe travels between two packages. */
/** Pixels of drag that move the carousel by one card. */
const PACKAGE_DRAG = 170

function taskIcon(task: string): IconName {
  if (/laundr|wash|fold|ironing/i.test(task)) return "washer"
  if (/alter|hem|tailor|sew|mend|pants|dress|jacket/i.test(task)) return "scissors"
  if (/organi[sz]|closet|wardrobe|declutter/i.test(task)) return "hanger"
  if (/dinner|meal|cook|lunch|breakfast|food|bake/i.test(task)) return "pot"
  if (/clean|reset|tidy|dust|vacuum|mop/i.test(task)) return "sparkle"
  return "check"
}

function ChoosePlanScreen({
  back,
  next,
  selected,
  setSelected,
  onOpenHelper,
  teamFor,
  canSeeMatches,
  onSeeMatches,
  bestTeam,
  states,
  plans,
  planIds,
  gaps,
  tasks,
  taskHours,
  scheduleLabel,
  timeLabel,
  priceChange,
  photoFor,
}: {
  plans: Partial<Record<PlanId, ServicePlan>>
  planIds: PlanId[]
  gaps: PackageGap[]
  states: Partial<Record<PlanId, PlanState>>
  tasks: string[]
  taskHours: number[]
  scheduleLabel: string
  timeLabel: (plan: ServicePlan) => string
  priceChange: PriceChange | null
  teamFor: (plan: PlanId) => string[]
  bestTeam: (plan: PlanId) => string[]
  canSeeMatches: (plan: PlanId) => boolean
  onSeeMatches: (plan: PlanId) => void
  back: () => void
  next: (plan: PlanId) => void
  selected: PlanId
  setSelected: (plan: PlanId) => void
  onOpenHelper: (id: string) => void
  photoFor: (plan: PlanId) => string
}) {
  const bestId = planIds.find((id) => states[id]?.tag === "Recommended") ?? selected
  const priceOf = (id: PlanId) => Number(plans[id]!.total.replace(/\D/g, ""))
  const reasonFor = (id: PlanId): string | null => {
    const gap = gaps.find((item) => item.id === id)
    if (gap) return gap.reason
    const issue = states[id]?.issue
    if (!issue || issue.nextDate) return null
    return id === "solo"
      ? `We couldn’t find one helper available to do all of these tasks on ${issue.weekday}.`
      : `Not everyone on this team is available on ${issue.weekday}.`
  }
  const cards = PLAN_IDS.filter(
    (id) => planIds.includes(id) || gaps.some((item) => item.id === id),
  )
  const count = cards.length
  const loop = count >= 3
  const titleOf = (id: PlanId) =>
    plans[id]?.title ?? gaps.find((item) => item.id === id)?.title ?? ""

  const stage = useRef<HTMLDivElement>(null)
  const position = useRef(Math.max(cards.indexOf(selected), 0))
  const frame = useRef(0)
  const lastWheel = useRef(0)
  const suppressClick = useRef(false)
  const drag = useRef<{
    x: number
    start: number
    moved: boolean
    lastX: number
    time: number
    speed: number
  } | null>(null)
  const [focused, setFocused] = useState<PlanId>(cards[position.current] ?? selected)
  const [detail, setDetail] = useState<null | "helpers">(null)

  /** Signed distance from the center, wrapped so every card has a neighbor on each side. */
  const wrap = (distance: number) =>
    loop ? ((((distance + count / 2) % count) + count) % count) - count / 2 : distance

  // Cards are moved directly rather than through React so dragging stays smooth.
  const place = () => {
    const items = stage.current?.querySelectorAll<HTMLElement>(".package-card")
    if (!items?.length) return
    const width = items[0].offsetWidth
    items.forEach((card, index) => {
      const distance = wrap(index - position.current)
      const amount = Math.abs(distance)
      const near = Math.min(amount, 1)
      const offset =
        Math.sign(distance) * (near * width * 0.36 + Math.max(amount - 1, 0) * width * 0.14)
      const scale = 1 - near * 0.42
      const turn = -Math.sign(distance) * near * 10
      card.style.transform = `translate3d(calc(-50% + ${offset}px), 0, 0) rotateY(${turn}deg) scale(${scale})`
      card.style.zIndex = String(100 - Math.round(amount * 10))
      card.style.opacity = String(Math.max(0, Math.min(1, (1.55 - amount) * 2.2)))
      card.style.setProperty("--depth", String(near))
    })
  }
  const settle = (target: number) => {
    const index = ((Math.round(target) % count) + count) % count
    const id = cards[index]
    setFocused(id)
    if (id !== focused) setDetail(null)
    if (!reasonFor(id) && id !== selected) setSelected(id)
  }
  const animateTo = (target: number) => {
    cancelAnimationFrame(frame.current)
    const from = position.current
    const began = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - began) / 420, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      position.current = from + (target - from) * eased
      place()
      if (progress < 1) frame.current = requestAnimationFrame(step)
      else settle(target)
    }
    frame.current = requestAnimationFrame(step)
  }
  const clampTarget = (target: number) =>
    loop ? target : Math.max(0, Math.min(count - 1, target))
  const goTo = (id: PlanId) => {
    const index = cards.indexOf(id)
    animateTo(loop ? position.current + wrap(index - position.current) : index)
  }
  const stepBy = (direction: number) =>
    animateTo(clampTarget(Math.round(position.current) + direction))

  useLayoutEffect(() => {
    place()
    const onResize = () => place()
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      cancelAnimationFrame(frame.current)
    }
  }, [])

  const focusedReason = reasonFor(focused)
  const active = plans[selected]!
  const activeIssue = states[selected]?.issue ?? null
  const footerDate = activeIssue?.nextDate
    ? shortDate(activeIssue.nextDate)
    : compactDate(scheduleLabel)
  const footerTime = timeLabel(active)
    .split(" · ")
    .filter((part) => !/helper confirms/i.test(part))
    .join(" · ")

  /** A small "package" picture built from the task icons. */
  const renderBundle = (muted = false) => {
    const shown = tasks.length > 3 ? tasks.slice(0, 2) : tasks
    return (
      <div className={`package-icons ${muted ? "is-muted" : ""}`} aria-hidden="true">
        {shown.map((task) => (
          <span key={task}>
            <Icon name={taskIcon(task)} size={16} />
          </span>
        ))}
        {tasks.length > 3 && <span className="package-icons-more">+{tasks.length - 2}</span>}
      </div>
    )
  }

  const hoursText = (hours: number) =>
    hours < 1 ? `${Math.round(hours * 60)} min` : `${hours} hour${hours === 1 ? "" : "s"}`

  const renderDetail = (id: PlanId) => {
    const plan = plans[id]!
    const team = teamFor(id)
    const title = team.length > 1 ? "Helpers" : "Helper"
    return (
      <>
        <button
          aria-label="Close details"
          className="package-detail-scrim"
          onClick={(event) => {
            event.stopPropagation()
            setDetail(null)
          }}
          type="button"
        />
        <div
          aria-label={title}
          className="package-detail"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <header>
            <h3>{title}</h3>
            <button
              aria-label="Close details"
              className="package-detail-close"
              onClick={() => setDetail(null)}
              type="button"
            >
              <Icon name="x" size={16} />
            </button>
          </header>
          <div className="package-detail-helpers">
            {team.map((helperId, index) => (
              <button
                aria-label={`View ${providerName(helperId)} profile`}
                key={`${helperId}-${index}`}
                onClick={() => onOpenHelper(helperId)}
                type="button"
              >
                <img alt="" src={helperPhotos[helperId]} />
                <strong>
                  {providerName(helperId)}
                  <Icon name="check" size={11} />
                </strong>
                <small>
                  ★ {providers.find((item) => item.id === helperId)!.rating} ·{" "}
                  {plan.roles?.[index] || providers.find((item) => item.id === helperId)!.service}
                </small>
                <span className="package-detail-go">
                  <Icon name="chevron" size={14} />
                </span>
              </button>
            ))}
          </div>
          {canSeeMatches(id) && (
            <button className="package-change-link" onClick={() => onSeeMatches(id)} type="button">
              {team.length > 1 ? "Change helpers" : "Change helper"}
            </button>
          )}
        </div>
      </>
    )
  }

  const renderTaskList = () => {
    const shown = tasks.length > 4 ? tasks.slice(0, 3) : tasks
    return (
      <ul className="match-tasks package-task-list">
        {shown.map((task) => (
          <li key={task}>
            <Icon name={taskIcon(task)} size={16} />
            <span>{task}</span>
            {taskHours[tasks.indexOf(task)] ? (
              <small>{hoursText(taskHours[tasks.indexOf(task)])}</small>
            ) : null}
          </li>
        ))}
        {tasks.length > 4 && (
          <li className="package-task-more">
            <Icon name="plus" size={16} />
            <span>{tasks.length - 3} more tasks</span>
          </li>
        )}
      </ul>
    )
  }

  const renderPlan = (id: PlanId) => {
    const plan = plans[id]!
    const state = states[id]!
    const team = teamFor(id)
    const isFront = id === focused
    const isBestPlan = id === bestId
    const isOriginal = bestTeam(id).join() === team.join()
    const tag = isBestPlan
      ? isOriginal
        ? "Recommended"
        : ""
      : state.tag === "Fastest"
        ? "Faster"
        : priceOf(id) < priceOf(bestId)
          ? "Lower price"
          : ""
    return (
      <>
        <div className="package-visual">
          <img alt="" className="package-visual-photo" src={photoFor(id)} />
          {renderBundle()}
        </div>
        <div className="package-head">
          <div className="package-title-row">
            <h2>{plan.title}</h2>
            {tag && <span className="match-tag">{tag}</span>}
          </div>
          <p className="match-reason">
            {isBestPlan && isOriginal ? state.note : plan.description}
          </p>
        </div>
        {renderTaskList()}
        <span className="visually-hidden">
          {team.map((helperId, index) => (
            <span className="match-helper" key={`${helperId}-${index}`}>
              <strong>
                {providerName(helperId)}
                <Icon name="check" size={11} />
              </strong>
              <small>
                ★ {providers.find((item) => item.id === helperId)!.rating} ·{" "}
                {plan.roles?.[index] || providers.find((item) => item.id === helperId)!.service}
              </small>
            </span>
          ))}
        </span>
        <div className="match-facts package-meta">
          <p className="package-duration">
            <Icon name="clock" size={14} />
            {(plan.durationLabel ?? hoursLabel(plan.hours)).replace(/^About /, "")}
          </p>
          <button
            aria-label="Show helpers"
            className="package-helpers-button"
            onClick={(event) => {
              if (!isFront) return
              event.stopPropagation()
              setDetail("helpers")
            }}
            type="button"
          >
            <span className="tile-avatars">
              {team.map((helperId, index) => (
                <img alt="" key={`${helperId}-${index}`} src={helperPhotos[helperId]} />
              ))}
            </span>
            {team.length === 1 ? providerName(team[0]) : `${team.length} helpers`}
            <Icon name="chevron" size={14} />
          </button>
        </div>
        {isFront && detail && renderDetail(id)}
      </>
    )
  }

  const renderGap = (id: PlanId, reason: string) => (
    <>
      <div className="package-visual">
        <img alt="" className="package-visual-photo" src={photoFor(id)} />
        {renderBundle(true)}
      </div>
      <div className="package-head">
        <div className="package-title-row">
          <h2>{titleOf(id)}</h2>
          <span className="match-tag">Not available</span>
        </div>
      </div>
      <div className="package-gap-note" role="note">
        <Icon name="alert" size={16} />
        <p>{reason}</p>
      </div>
      <p className="package-gap-hint">Swipe to see the packages that work for you.</p>
    </>
  )

  return (
    <div className="screen booking-flow-screen">
      <FlowHeader back={back} step="2 of 3" title="Choose a package" />
      <main className="screen-scroll plan-page">
        <div
          aria-label="Packages"
          aria-roledescription="carousel"
          className="package-carousel"
          onClickCapture={(event) => {
            if (suppressClick.current) {
              event.preventDefault()
              event.stopPropagation()
              suppressClick.current = false
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") stepBy(1)
            if (event.key === "ArrowLeft") stepBy(-1)
          }}
          onPointerCancel={() => {
            drag.current = null
            animateTo(clampTarget(Math.round(position.current)))
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return
            cancelAnimationFrame(frame.current)
            drag.current = {
              x: event.clientX,
              start: position.current,
              moved: false,
              lastX: event.clientX,
              time: performance.now(),
              speed: 0,
            }
          }}
          onPointerMove={(event) => {
            const current = drag.current
            if (!current) return
            const moved = event.clientX - current.x
            if (!current.moved) {
              if (Math.abs(moved) < 6) return
              current.moved = true
              event.currentTarget.setPointerCapture(event.pointerId)
            }
            const now = performance.now()
            current.speed = (event.clientX - current.lastX) / Math.max(now - current.time, 1)
            current.lastX = event.clientX
            current.time = now
            let next = current.start - moved / PACKAGE_DRAG
            if (!loop) next = Math.max(-0.25, Math.min(count - 0.75, next))
            position.current = next
            place()
          }}
          onPointerUp={() => {
            const current = drag.current
            drag.current = null
            if (!current) return
            if (!current.moved) {
              // A tap that never dragged: let the card's own click run.
              return
            }
            suppressClick.current = true
            window.setTimeout(() => {
              suppressClick.current = false
            }, 80)
            const flick = Math.abs(current.speed) > 0.35
            const target = flick
              ? Math.round(current.start) + (current.speed < 0 ? 1 : -1)
              : Math.round(position.current)
            animateTo(clampTarget(target))
          }}
          onWheel={(event) => {
            if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 12)
              return
            const now = performance.now()
            if (now - lastWheel.current < 450) return
            lastWheel.current = now
            stepBy(event.deltaX > 0 ? 1 : -1)
          }}
          ref={stage}
          tabIndex={0}
        >
          {cards.map((id) => {
            const reason = reasonFor(id)
            const isFront = id === focused
            return (
              <article
                aria-current={isFront}
                aria-label={titleOf(id)}
                className={`package-card ${isFront ? "is-front" : ""} ${
                  isFront && !reason ? "is-selected" : ""
                } ${reason ? "is-unavailable" : ""}`}
                data-plan={id}
                data-total={reason ? undefined : plans[id]?.total.replace(" total", "")}
                key={id}
                onClick={() => {
                  if (!isFront) goTo(id)
                }}
              >
                {reason ? renderGap(id, reason) : renderPlan(id)}
              </article>
            )
          })}
        </div>
        {count > 1 && (
          <div className="package-dots">
            {cards.map((id) => (
              <button
                aria-label={`Show ${titleOf(id)}`}
                className={id === focused ? "active" : ""}
                key={id}
                onClick={() => goTo(id)}
                type="button"
              />
            ))}
          </div>
        )}
      </main>
      <div className="warm-sticky-footer package-footer">
        {focusedReason ? (
          <span>
            <strong>Not available</strong>
            <small>Choose another package</small>
          </span>
        ) : (
          <span>
            <strong>{active.total.replace(" total", "")}</strong>
            <small>
              {footerDate}
              {footerTime ? ` · ${footerTime}` : ""}
            </small>
          </span>
        )}
        <Button
          className="book-now-button"
          disabled={Boolean(focusedReason) || Boolean(activeIssue && !activeIssue.nextDate)}
          onClick={() => next(selected)}
        >
          Book now
        </Button>
      </div>
    </div>
  )
}

const defaultHelperIds = ["maria", "jasmine", "nora", "elena", "sofia", "nina"]

function HelperPicker({
  slot,
  setSlot,
  team,
  roles,
  bestIds,
  options,
  rows,
  extraCost,
  availabilityLine,
  apply,
  openProfile,
  close,
}: {
  slot: number
  setSlot: (slot: number) => void
  team: string[]
  roles: string[]
  bestIds: string[]
  options: string[]
  rows: number
  extraCost: (id: string) => string
  availabilityLine: string
  apply: (team: string[]) => void
  openProfile: (id: string) => void
  close: () => void
}) {
  const [draft, setDraft] = useState(team)
  const changed = draft.join() !== team.join()
  const signed = (cost: string) =>
    cost
      .replace(/^\$(\d+) more$/, "+$$$1")
      .replace(/^\$(\d+) less$/, "−$$$1")
      .replace(/^Same total$/, "")
  return (
    <div className="helper-selection-overlay helper-picker">
      <button
        aria-label="Close other matches"
        className="overlay-scrim"
        onClick={close}
        type="button"
      />
      <section aria-modal="true" role="dialog">
        <div className="overlay-heading">
          <h2>{team.length > 1 ? "Change helpers" : "Change helper"}</h2>
          <Button ariaLabel="Close other matches" onClick={close} variant="icon">
            <Icon name="x" />
          </Button>
        </div>
        {team.length > 1 && (
          <div className="helper-slots">
            {draft.map((id, index) => (
              <button
                className={slot === index ? "selected" : ""}
                key={index}
                onClick={() => setSlot(index)}
                type="button"
              >
                <small>{roles[index] ?? `Helper ${index + 1}`}</small>
                <strong>{providerName(id)}</strong>
              </button>
            ))}
          </div>
        )}
        <div className="helper-choice-list" style={{ minHeight: rows * 84 }}>
          {options.map((id) => {
            const item = providers.find((entry) => entry.id === id)!
            const current = draft[slot] === id
            const elsewhere = !current && draft.includes(id)
            const isBest = bestIds[slot] === id
            const cost = signed(extraCost(id))
            return (
              <div className={current ? "selected" : ""} key={id}>
                <button
                  aria-label={`View ${item.name} profile`}
                  className="helper-choice-info"
                  onClick={() => openProfile(id)}
                  type="button"
                >
                  <img alt="" src={helperPhotos[id]} />
                  <span>
                    <strong>
                      {item.name}
                      {item.verified && <Icon name="check" size={13} />}
                      {isBest && <em>Best match</em>}
                    </strong>
                    <small>
                      ★ {item.rating} · {item.skills[0]}
                    </small>
                    <small>
                      {availabilityLine}
                      {cost && <b className="helper-choice-cost"> · {cost}</b>}
                    </small>
                  </span>
                </button>
                {current ? (
                  <span className="helper-choice-state">
                    <Icon name="check" size={14} />
                    Selected
                  </span>
                ) : elsewhere ? (
                  <span className="helper-choice-state is-muted">On plan</span>
                ) : (
                  <button
                    aria-label={`Select ${item.name}`}
                    className="helper-choice-select"
                    onClick={() =>
                      setDraft((current) => current.map((value, index) => (index === slot ? id : value)))
                    }
                    type="button"
                  >
                    Select
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div className="helper-picker-actions">
          <Button disabled={!changed} onClick={() => apply(draft)}>
            Update match
          </Button>
        </div>
      </section>
    </div>
  )
}

const bookingHelpers = [
  {
    id: "maria",
    name: "Maria G.",
    rating: "4.9",
    reviews: "124 reviews",
    skills: "Cooking · Home reset · Organization",
    trust: "Identity verified",
  },
  {
    id: "jasmine",
    name: "Jasmine R.",
    rating: "4.8",
    reviews: "86 reviews",
    skills: "Organization · Cleaning · Home reset",
    trust: "Background checked",
  },
  {
    id: "nora",
    name: "Nora P.",
    rating: "4.8",
    reviews: "88 reviews",
    skills: "Meal preparation · Organization",
    trust: "Identity verified",
  },
  {
    id: "elena",
    name: "Elena M.",
    rating: "4.9",
    reviews: "52 reviews",
    skills: "Meal preparation · Grocery planning",
    trust: "Identity verified",
  },
  {
    id: "sofia",
    name: "Sofia K.",
    rating: "4.8",
    reviews: "41 reviews",
    skills: "Family meals · Dinner service",
    trust: "Background checked",
  },
  {
    id: "nina",
    name: "Nina P.",
    rating: "4.9",
    reviews: "47 reviews",
    skills: "Vegetarian meals · Batch cooking",
    trust: "Identity verified",
  },
  {
    id: "clara",
    name: "Clara W.",
    rating: "4.9",
    reviews: "102 reviews",
    skills: "Alterations · Hemming · Fittings",
    trust: "Identity verified",
  },
  {
    id: "selin",
    name: "Selin A.",
    rating: "4.9",
    reviews: "87 reviews",
    skills: "Personal styling · At-home beauty",
    trust: "Background checked",
  },
  {
    id: "dara",
    name: "Dara K.",
    rating: "4.8",
    reviews: "74 reviews",
    skills: "Eyebrow threading · At-home beauty",
    trust: "Identity verified",
  },
]

function CompactBookingHelper({
  helper,
  selected = false,
  onOpen,
}: {
  helper: typeof bookingHelpers[number]
  selected?: boolean
  onOpen?: () => void
}) {
  return (
    <div
      className={`compact-booking-helper ${selected ? "selected" : ""} ${
        onOpen ? "clickable-card" : ""
      }`}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <img alt={helper.name} src={helperPhotos[helper.id]} />
      <span>
        <strong>{helper.name}</strong>
        <small>
          ★ {helper.rating} · {helper.reviews}
        </small>
        <small>{helper.skills}</small>
        <small className="trust-line">
          <Icon name="check" size={12} /> {helper.trust}
        </small>
      </span>
      {selected && (
        <span className="large-check">
          <Icon name="check" size={15} />
        </span>
      )}
    </div>
  )
}

function ReviewSection({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string
  editLabel?: string
  onEdit?: () => void
  children: ReactNode
}) {
  return (
    <section className="review-section">
      <header>
        <h2>{title}</h2>
        {onEdit && (
          <button aria-label={editLabel} onClick={onEdit} type="button">
            <Icon name="edit" size={15} />
          </button>
        )}
      </header>
      {children}
    </section>
  )
}

function ReviewPayScreen({
  back,
  editRequest,
  booked,
  bookingTasks,
  date,
  time,
  address,
  access,
  ingredients,
  selectedPlan,
  paymentMethod,
  setPaymentMethod,
  team,
  onChangeHelper,
  issue,
  moveDate,
  plan,
  request,
  canSeeMatches,
  onOpenHelper,
  service,
}: {
  service: ServiceInfo | null
  back: () => void
  editRequest: (section: RequestSection | null) => void
  booked: (paymentLabel: string) => void
  bookingTasks: string[]
  date: string
  time: string
  address: string
  access: string
  ingredients: string
  selectedPlan: PlanId
  paymentMethod: string
  setPaymentMethod: (method: string) => void
  team: string[]
  onChangeHelper: () => void
  onOpenHelper: (id: string) => void
  issue: PlanIssue | null
  moveDate: (date: string) => void
  plan: ServicePlan
  request: ServiceRequest
  canSeeMatches: boolean
}) {
  const [processing, setProcessing] = useState(false)
  const [paymentError, setPaymentError] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const total = plan.total.replace(" total", "")
  const totalValue = Number(total.replace("$", ""))
  const serviceFee = plan.fee ?? (service ? Math.round(totalValue * 0.11) : 36)
  const helperIds = team
  const reviewStart = parseRangeStart(time)
  const scheduleLine =
    request.timePreference?.kind === "exact" && reviewStart !== null
      ? formatRange(reviewStart, plan.hours)
      : request.timePreference?.kind === "flexible"
        ? "Helper confirms a time"
        : `${describeTime(request.timePreference).label} · Helper confirms a time`
  const arrivalLine = [
    needsHomeAccess(request) ? access : "",
    includesMeals(request) || service ? ingredients : "",
  ]
    .filter(Boolean)
    .join(" · ")
  const cardDigits = cardNumber.replace(/\D/g, "")
  const pay = () => {
    setPaymentError("")
    if (paymentMethod === "Add payment method" && cardDigits.length < 12) {
      setPaymentError("Add a valid payment method before booking.")
      return
    }
    setProcessing(true)
    const paymentLabel =
      paymentMethod === "Add payment method"
        ? `Card ending in ${cardDigits.slice(-4)}`
        : paymentMethod
    window.setTimeout(() => booked(paymentLabel), 700)
  }

  return (
    <div className="screen booking-flow-screen">
      <FlowHeader back={back} step="3 of 3" title="Review and pay" />
      <main className="screen-scroll review-flow-content rv-content">
        {issue && (
          <PlanIssueNotice
            issue={issue}
            onMove={issue.nextDate ? () => moveDate(issue.nextDate!) : undefined}
          />
        )}
        <ReviewSection
          editLabel="Edit tasks"
          onEdit={() => editRequest("tasks")}
          title="Tasks"
        >
          <strong>{plan.title}</strong>
          <p>{bookingTasks.join(", ")}</p>
        </ReviewSection>
        <ReviewSection
          editLabel="Edit schedule"
          onEdit={() => editRequest("date")}
          title="Schedule"
        >
          <strong>{date}</strong>
          <p>{scheduleLine}</p>
        </ReviewSection>
        <ReviewSection
          editLabel="Edit address"
          onEdit={() => editRequest("location")}
          title="Address"
        >
          <strong>{address}</strong>
          {arrivalLine && <p>{arrivalLine}</p>}
        </ReviewSection>
        <ReviewSection
          editLabel="See other matches"
          onEdit={canSeeMatches ? onChangeHelper : undefined}
          title={helperIds.length === 1 ? "Helper" : "Helpers"}
        >
          <div className="match-helpers">
            {helperIds.map((id, index) => (
              <HelperMatchRow
                id={id}
                key={id}
                onOpen={onOpenHelper}
                role={plan.roles?.[index] ?? ""}
              />
            ))}
          </div>
        </ReviewSection>
        <ReviewSection title="Payment method">
          <div className="rv-pay-options">
            {[
              ["Apple Pay", "Apple Pay"],
              ["Saved Visa", "Visa 4242"],
              ["Add payment method", "New card"],
            ].map(([method, label]) => (
              <button
                aria-label={method}
                aria-pressed={paymentMethod === method}
                className={`cd-chip ${paymentMethod === method ? "selected" : ""}`}
                key={method}
                onClick={() => {
                  setPaymentMethod(method)
                  setPaymentError("")
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {paymentMethod === "Add payment method" && (
            <label className="location-editor">
              <span>Card number</span>
              <input
                aria-label="Card number"
                inputMode="numeric"
                onChange={(event) => {
                  setCardNumber(event.target.value)
                  setPaymentError("")
                }}
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
              />
            </label>
          )}
          {paymentError && (
            <p className="payment-error" role="alert">
              {paymentError}
            </p>
          )}
        </ReviewSection>
        <ReviewSection title="Price breakdown">
          <PriceLines
            lines={
              plan.lines ?? [
                { label: "Services", amount: totalValue - serviceFee },
                { label: "Service and protection fee", amount: serviceFee },
              ]
            }
            total={total}
          />
        </ReviewSection>
      </main>
      <div className="payment-sticky-footer">
        <span>
          <small>Total</small>
          <strong>{total}</strong>
        </span>
        <Button disabled={processing || Boolean(issue)} onClick={pay}>
          {processing ? "Processing…" : "Pay and book"}
        </Button>
      </div>
    </div>
  )
}

function NewConfirmation({
  booking,
  viewTask,
  onNavigate,
}: {
  booking: Booking
  viewTask: () => void
  onNavigate: (page: NavPage) => void
}) {
  const weekday = weekdayOf(booking.date)
  return (
    <div className="screen new-confirmation confirmation-with-nav">
      <main>
        <div className="confirmation-message">
          <div className="confirmation-icon">
            <Icon name="check" size={30} />
          </div>
          <h1>You’re all set</h1>
          <p>
            {booking.serviceTitle
              ? `Your booking for ${booking.serviceTitle} is confirmed for ${weekday}.`
              : booking.dateWindowEnd
                ? "Your booking is confirmed. Your helper will confirm a time."
                : `Your booking is confirmed for ${weekday}.`}
          </p>
        </div>
        <section>
          <div>
            <span>Tasks</span>
            <strong>{booking.tasks.join(", ")}</strong>
          </div>
          <div>
            <span>Date and time</span>
            <strong>
              {booking.date}
              <small>{booking.time}</small>
            </strong>
          </div>
          <div>
            <span>Address</span>
            <strong>{booking.address}</strong>
          </div>
          <div>
            <span>{booking.helperIds.length === 1 ? "Helper" : "Helpers"}</span>
            <strong>{booking.helperIds.map(providerName).join(", ")}</strong>
          </div>
          <div>
            <span>Payment</span>
            <strong>Confirmed · {booking.paymentMethod}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong className="confirmation-total">{booking.total}</strong>
          </div>
        </section>
      </main>
      <div className="new-confirmation-actions">
        <Button onClick={viewTask}>View task</Button>
      </div>
      <MainNavigation active="tasks" onNavigate={onNavigate} taskNotice />
    </div>
  )
}

function ManageBookingSheet({
  booking,
  close,
  update,
  cancel,
}: {
  booking: Booking
  close: () => void
  update: (patch: Partial<Booking>, message: string) => void
  cancel: () => void
}) {
  const [mode, setMode] = useState<"menu" | "date" | "access" | "cancel">("menu")
  const [newDate, setNewDate] = useState<string | null>(null)
  const [newStart, setNewStart] = useState<number | null>(null)
  const [newAccess, setNewAccess] = useState(booking.access)
  const swipe = useSwipeDown(close)
  const dateOptions = [
    "Friday, November 13",
    "Saturday, November 14",
    "Monday, November 16",
    "Thursday, November 19",
  ]
  const timeOptions: Array<[number, string]> = [
    [10, "10:00 AM"],
    [13, "1:00 PM"],
    [16, "4:00 PM"],
  ]
  const headings = {
    menu: "Manage booking",
    date: "Change date or time",
    access: "Update entry instructions",
    cancel: "Cancel this booking?",
  }
  const saveDate = () => {
    const label = timeOptions.find(([value]) => value === newStart)?.[1]
    update(
      {
        date: newDate ?? booking.date,
        dateWindowEnd: newDate ? undefined : booking.dateWindowEnd,
        time:
          newStart === null
            ? booking.time
            : booking.hours
              ? formatRange(newStart, booking.hours)
              : (label ?? booking.time),
        statusLabel: "Rescheduled",
        homeLabel: undefined,
        calendarAdded: false,
      },
      "Booking rescheduled",
    )
  }
  return (
    <div className="nested-overlay">
      <button
        aria-label="Close booking management"
        className="overlay-scrim"
        onClick={close}
        type="button"
      />
      <section className="manage-sheet" {...swipe}>
        <div className="sheet-handle" />
        <div className="overlay-heading">
          <h2>{headings[mode]}</h2>
          <Button
            ariaLabel="Close"
            className="plain-close"
            onClick={close}
            variant="icon"
          >
            <Icon name="x" />
          </Button>
        </div>
        {mode === "menu" &&
          (
            [
              ["Change date or time", "date"],
              ["Update entry instructions", "access"],
              ["Cancel booking", "cancel"],
            ] as const
          ).map(([label, next]) => (
            <button key={label} onClick={() => setMode(next)} type="button">
              <span>{label}</span>
              <Icon name="chevron" size={17} />
            </button>
          ))}
        {mode === "date" && (
          <div className="manage-panel">
            <h3>Date</h3>
            <div className="manage-chips">
              {dateOptions.map((item) => (
                <button
                  className={newDate === item ? "selected" : ""}
                  key={item}
                  onClick={() => setNewDate(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <h3>Start time</h3>
            <div className="manage-chips">
              {timeOptions.map(([value, label]) => (
                <button
                  className={newStart === value ? "selected" : ""}
                  key={label}
                  onClick={() => setNewStart(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              disabled={newDate === null && newStart === null}
              onClick={saveDate}
            >
              Save changes
            </Button>
          </div>
        )}
        {mode === "access" && (
          <div className="manage-panel">
            <div className="selection-list">
              {["Doorman", "Smart-lock code", "Lockbox", "Arrange later"].map(
                (item) => (
                  <SelectionRow
                    key={item}
                    label={item}
                    onSelect={() => setNewAccess(item)}
                    selected={newAccess === item}
                  />
                ),
              )}
            </div>
            <Button
              onClick={() =>
                update({ access: newAccess }, "Entry instructions updated")
              }
            >
              Save changes
            </Button>
          </div>
        )}
        {mode === "cancel" && (
          <div className="manage-panel">
            <p>
              {booking.title} on {booking.date} will be cancelled and {booking.total}{" "}
              will be refunded to {booking.paymentMethod}.
            </p>
            <div className="plan-details-actions plan-details-actions--flush">
              <Button onClick={() => setMode("menu")} variant="secondary">
                Keep booking
              </Button>
              <Button onClick={cancel}>Cancel booking</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function UIKitScreen({ back }: { back: () => void }) {
  return (
    <div className="screen ui-kit-screen">
      <main className="screen-scroll ui-kit-content">
        <PageHeader back={back} subtitle="Internal reference" title="UI kit" />
        <section>
          <h2>Color tokens</h2>
          <div className="token-swatches">
            {[
              ["Background", "background"],
              ["Surface", "surface"],
              ["Burgundy", "sage"],
              ["Blush", "sage-soft"],
              ["Rating yellow", "yellow"],
            ].map(([label, tone]) => (
              <div key={label}>
                <i className={tone} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Typography</h2>
          <div className="type-samples">
            <h1>Page title</h1>
            <h2>Section title</h2>
            <h3>Card title</h3>
            <p>Body text for clear, human guidance.</p>
            <small>Caption and supporting detail</small>
          </div>
        </section>
        <section>
          <h2>Actions</h2>
          <div className="kit-actions">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary action</Button>
            <Button variant="text">Text action</Button>
          </div>
        </section>
        <section>
          <h2>Components</h2>
          <div className="kit-component-stack">
            <span className="status-label">Confirmed</span>
            <button className="kit-row" type="button">
              <span>
                <strong>Accordion row</strong>
                <small>Supporting summary</small>
              </span>
              <Icon name="plus" />
            </button>
            <button className="review-payment-option selected" type="button">
              <span className="payment-mark">Visa</span>
              <strong>Payment row</strong>
              <span className="large-check">
                <Icon name="check" size={14} />
              </span>
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

const defaultBookingTasks = [
  "Prepare dinner",
  "Reset living room",
  "Organize kitchen cabinets",
]
const defaultBookingDate = "Saturday, November 14"
const defaultBookingTime = "1:00–4:30 PM"

export default function App() {
  const [view, setView] = useState<MainView>("booking")
  const [returnView, setReturnView] = useState<MainView>("booking")
  const [screen, setScreen] = useState<Screen>(1)
  const [rawSelectedPlan, setSelectedPlan] = useState<PlanId>("team")
  const [request, setRequest] = useState<ServiceRequest>(() =>
    emptyRequest(selectedAddressLabel),
  )
  const [booked, setBooked] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>(initialBookings)
  const [activeService, setActiveService] = useState("Guest ready")
  const [bookingService, setBookingService] = useState<ServiceInfo | null>(null)
  const [lastBookingId, setLastBookingId] = useState<string | null>(null)
  const [planDetailsId, setPlanDetailsId] = useState<string | null>(null)
  const [planReturnView, setPlanReturnView] = useState<MainView>("tasks")
  const [manageBookingId, setManageBookingId] = useState<string | null>(null)
  const [threadBookingId, setThreadBookingId] = useState<string | null>(null)
  const [messageProviderId, setMessageProviderId] = useState<string | null>(null)
  const [returnToReview, setReturnToReview] = useState(false)
  const [editSection, setEditSection] = useState<RequestSection | null>(null)
  const [savedProviders, setSavedProviders] = useState([
    "maria",
    "jasmine",
    "clara",
    "nora",
  ])
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [composerRequest, setComposerRequest] = useState("")
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedBookingHelper, setSelectedBookingHelper] = useState("maria")
  const [planTeams, setPlanTeams] = useState<Partial<Record<PlanId, string[]>>>({})
  const [priceChange, setPriceChange] = useState<PriceChange | null>(null)
  const [bookingReturn, setBookingReturn] = useState<MainView>("booking")
  const [helperPicker, setHelperPicker] = useState<{
    plan: PlanId
    slot: number
  } | null>(null)
  const [exploreQuery, setExploreQuery] = useState("")
  const [helpersScope, setHelpersScope] = useState<string | null>(null)
  const [helpersQuery, setHelpersQuery] = useState("")
  const [helpersReturn, setHelpersReturn] = useState<MainView>("explore")
  const [toast, setToast] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Apple Pay")
  const [messageOrigin, setMessageOrigin] = useState<"tasks" | "saved">("tasks")

  const generatedPlans = bookingService
    ? []
    : generatePlans(request, { overrides: planTeams, savedHelpers: savedProviders })
  const bestGenerated = generatedPlans.find((plan) => plan.isBest)
  const packageGapsFor = bookingService ? [] : packageGaps(request, generatedPlans)
  const plannedHours = bookingService?.hours ?? bestGenerated?.hours ?? 3.5
  const date = describeDate(request.datePreference).label
  const timePreference = request.timePreference
  const time = !timePreference
    ? ""
    : timePreference.kind === "exact"
      ? formatRange(timePreference.hour, plannedHours)
      : timePreference.kind === "flexible"
        ? "Flexible time"
        : describeTime(timePreference).label
  const address = request.location ?? ""
  const access = request.access ?? "Arrange later"
  const ingredients =
    request.ingredients ??
    (bookingService ? serviceOption(bookingService).options[0] : "Use what I have")
  const bookingTasks = request.tasks.map((task) => task.title)
  const updateRequest = (change: (current: ServiceRequest) => ServiceRequest) => {
    setRequest((current) => refreshRequest(change(current)))
  }
  const setDate = (label: string) => {
    const iso = isoFromLongDate(label)
    if (iso) {
      updateRequest((current) => ({
        ...current,
        datePreference: { kind: "specific", date: iso },
      }))
    }
  }
  const setTime = (value: string) => {
    const start = parseRangeStart(value)
    updateRequest((current) => ({
      ...current,
      timePreference:
        value === "Flexible time"
          ? { kind: "flexible" }
          : start !== null
            ? { kind: "exact", hour: start }
            : current.timePreference,
    }))
  }
  const setAddress = (location: string) =>
    updateRequest((current) => ({ ...current, location }))
  const setAccess = (value: string) =>
    updateRequest((current) => ({ ...current, access: value }))
  const setIngredients = (value: string) =>
    updateRequest((current) => ({ ...current, ingredients: value }))
  const setBookingTasks = (titles: string[]) =>
    updateRequest((current) => ({
      ...current,
      tasks:
        titles.length === current.tasks.length
          ? current.tasks.map((task, index) => {
              if (titles[index] === task.title) return task
              const parsed = taskFromTitle(titles[index])
              return parsed.category !== task.category && parsed.category !== "other"
                ? {
                    ...parsed,
                    id: task.id,
                    datePreference: task.datePreference,
                    timePreference: task.timePreference,
                  }
                : { ...task, title: titles[index] }
            })
          : titles.map(
              (title) =>
                current.tasks.find((task) => task.title === title) ?? taskFromTitle(title),
            ),
    }))
  const defaultSchedule = (): Pick<ServiceRequest, "datePreference" | "timePreference"> => ({
    datePreference: { kind: "specific", date: isoFromLongDate(defaultBookingDate)! },
    timePreference: { kind: "exact", hour: 13 },
  })

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 1800)
  }
  const navigateMain = (page: NavPage) => {
    if (page === "home") {
      setView("booking")
      setScreen(1)
      return
    }
    if (page === "explore") {
      setExploreQuery("")
      setView("explore")
      return
    }
    setView(page)
  }
  const openComposer = (prefill = "") => {
    setComposerRequest(prefill)
    setReturnToReview(false)
    setEditSection(null)
    setBookingService(null)
    setRequest({
      ...emptyRequest(address || selectedAddressLabel),
      ...defaultSchedule(),
      ingredients: "Use what I have",
    })
    setSelectedBookingHelper("maria")
    setPlanTeams({})
    setPriceChange(null)
    setView("booking")
    setScreen(2)
  }
  const openHelpers = (scope: string | null, query: string) => {
    setHelpersScope(scope)
    setHelpersQuery(query)
    setHelpersReturn(view)
    setView("helpers")
  }
  const startServiceBooking = (service: ServiceInfo, helperId?: string) => {
    setReturnToReview(false)
    setEditSection(null)
    setBookingService(service)
    setActiveService(service.title)
    setRequest(
      refreshRequest({
        ...emptyRequest(address || selectedAddressLabel),
        ...defaultSchedule(),
        tasks: service.tasks.map(taskFromTitle),
        ingredients: serviceOption(service).options[0],
      }),
    )
    setSelectedPlan("solo")
    setSelectedBookingHelper(helperId ?? service.helperIds[0])
    setPlanTeams({})
    setPriceChange(null)
    setBookingReturn(view)
    setSelectedProvider(null)
    setView("booking")
    setScreen(2)
  }
  const bookHelper = (id: string, scope: string | null) => {
    startServiceBooking(
      scope && services[scope].helperIds.includes(id)
        ? services[scope]
        : services[primaryServiceByHelper[id]],
      id,
    )
  }
  const generatedFor = (plan: PlanId) =>
    generatedPlans.find((item) => item.id === plan)
  const teamFor = (plan: PlanId) =>
    bookingService
      ? (planTeams[plan] ??
        orderedHelpers(bookingService, selectedBookingHelper).slice(
          0,
          getServicePlans(bookingService, date, time)[plan].helperCount,
        ))
      : (generatedFor(plan)?.helperIds ?? [])
  const slotCandidates = (plan: PlanId, slot: number) => {
    const generated = generatedFor(plan)
    return generated ? candidatesForSlot(request, generated, slot, savedProviders) : []
  }
  const helperChoices = (plan: PlanId, slot: number) => {
    if (!bookingService) return slotCandidates(plan, slot).map((item) => item.helperId)
    const team = teamFor(plan)
    return [...new Set([team[slot], ...bookingService.helperIds])].filter(
      (id) => id === team[slot] || !team.includes(id),
    )
  }
  const helperIsBusy = (plan: PlanId, slot: number, id: string) => {
    if (bookingService) {
      return Boolean(findPlanIssue([id], date, time, activePlans[plan]?.hours ?? plannedHours))
    }
    return slotCandidates(plan, slot).find((item) => item.helperId === id)?.available !== true
  }
  const baselinePlans = bookingService
    ? []
    : generatePlans(request, { savedHelpers: savedProviders })
  const bestIdsFor = (plan: PlanId) =>
    bookingService
      ? orderedHelpers(bookingService, selectedBookingHelper).slice(
          0,
          getServicePlans(bookingService, date, time)[plan].helperCount,
        )
      : (baselinePlans.find((item) => item.id === plan)?.helperIds ?? [])
  /** Only people who can really do this role on this schedule, best match first. */
  const matchOptions = (plan: PlanId, slot: number) => {
    const best = bestIdsFor(plan)[slot]
    const open = helperChoices(plan, slot).filter((id) => !helperIsBusy(plan, slot, id))
    return best && open.includes(best) ? [best, ...open.filter((id) => id !== best)] : open
  }
  const firstMatchSlot = (plan: PlanId) =>
    teamFor(plan).findIndex((_, slot) => matchOptions(plan, slot).length > 1)
  const matchAvailability = (plan: PlanId) => {
    const nextDate = activeStates[plan]?.issue?.nextDate
    if (nextDate) return `Changes appointment to ${shortDate(nextDate)}`
    const preference = request.datePreference
    if (preference?.kind === "specific") return `Available ${shortDateIso(preference.date)}`
    return `Available ${blockedLabel(preference)}`
  }
  const replacementCost = (plan: PlanId, slot: number, id: string) => {
    const generated = generatedFor(plan)
    if (!generated || generated.helperIds[slot] === id) return ""
    return priceDifference(replacementTotal(request, generated, slot, id) - generated.price.total)
  }
  const assignHelper = (plan: PlanId, slot: number, id: string) => {
    setPriceChange(null)
    const team = [...teamFor(plan)]
    team[slot] = id
    setPlanTeams((current) => ({ ...current, [plan]: team }))
  }
  const addToRequest = (text: string) => {
    const nextRequest = parseRequest(text, request)
    setRequest(nextRequest)
    if (bookingService) return
    const nextBest = generatePlans(nextRequest, {
      overrides: planTeams,
      savedHelpers: savedProviders,
    }).find((plan) => plan.isBest)
    const added = nextRequest.tasks.filter(
      (task) => !request.tasks.some((item) => item.id === task.id),
    )
    if (!nextBest || added.length === 0) {
      setPriceChange(null)
      return
    }
    setPriceChange({
      items: [
        ...added.map((task) => `${task.title} added`),
        nextBest.id !== bestGenerated?.id ||
        nextBest.helperIds.join() !== bestGenerated?.helperIds.join()
          ? "Plan updated"
          : "",
      ].filter(Boolean),
      total: nextBest.price.total,
      difference: bestGenerated ? nextBest.price.total - bestGenerated.price.total : 0,
    })
  }
  const completeBooking = (paymentLabel: string) => {
    const plan = activePlans[selectedPlan]!
    const start = parseRangeStart(time)
    const finalTime =
      timePreference?.kind === "exact" && start !== null
        ? formatRange(start, plan.hours)
        : timePreference?.kind === "flexible"
          ? "Helper confirms a time"
          : time
    const helperIds = teamFor(selectedPlan)
    const total = plan.total.replace(" total", "")
    const totalValue = Number(total.replace("$", ""))
    const dateWindowEnd =
      request.datePreference && request.datePreference.kind !== "specific"
        ? windowEnd(request.datePreference)
        : undefined
    const id = `booking-${bookings.length}`
    const record: Booking = {
      id,
      title:
        bookingService?.title ??
        (request.tasks.length === 1 ? request.tasks[0].title : "Your Service Plan"),
      subtitle: bookingService?.tagline ?? "Preparing for guests",
      photo: bookingService
        ? servicePhotos[bookingService.title]
        : servicePhotos["Your Service Plan"],
      date,
      time: finalTime,
      dateWindowEnd,
      serviceFee: plan.fee ?? (bookingService ? Math.round(totalValue * 0.11) : 36),
      hours: plan.hours,
      address,
      access,
      tasks: bookingTasks,
      helperIds,
      total,
      planTitle: plan.title,
      paymentMethod: paymentLabel,
      reference: `SP-${1100 + bookings.length}-${total.replace("$", "")}`,
      status: "upcoming",
      statusLabel: "Confirmed",
      serviceTitle: bookingService?.title,
    }
    setBookings((current) => [...current, record])
    setLastBookingId(id)
    setBooked(true)
    setComposerRequest("")
    setScreen(6)
  }
  const updateBooking = (id: string, patch: Partial<Booking>) => {
    setBookings((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }
  const openBooking = (id: string) => {
    const record = bookings.find((item) => item.id === id)
    if (!record) {
      setSelectedTask(id)
      return
    }
    if (id === "tailoring" && record.status === "upcoming") {
      setSelectedTask(id)
      return
    }
    setPlanDetailsId(id)
    setPlanReturnView(view)
    setView("plan-details")
  }
  const submitHomeRequest = () => {
    if (!composerRequest.trim() || searchLoading) return
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    setSearchLoading(true)
    window.setTimeout(() => {
      setSearchLoading(false)
      setReturnToReview(false)
      setEditSection(null)
      setBookingService(null)
      setSelectedBookingHelper("maria")
      setPlanTeams({})
      setRequest(parseRequest(composerRequest, emptyRequest(address || selectedAddressLabel)))
      setPriceChange(null)
      setView("booking")
      setScreen(2)
    }, 700)
  }
  const toggleSaved = (id: string) => {
    setSavedProviders((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      notify("Saved to your list")
      return [...current, id]
    })
  }
  const openProvider = (id: string) => {
    setSelectedProvider(id)
  }
  const markCalendarAdded = (id: string) => {
    updateBooking(id, { calendarAdded: true })
    notify("Added to calendar")
  }
  const nextUpcoming =
    nearestFirst(bookings.filter((item) => item.status === "upcoming"))[0] ?? null
  const lastBooking = bookings.find((item) => item.id === lastBookingId) ?? null
  const planDetailsBooking =
    bookings.find((item) => item.id === planDetailsId) ?? null
  const manageBooking =
    bookings.find((item) => item.id === manageBookingId) ?? null
  const threadBooking =
    bookings.find((item) => item.id === threadBookingId) ?? null
  const inBooking = view === "booking" && [3, 5].includes(screen)
  const activePlans: Partial<Record<PlanId, ServicePlan>> = bookingService
    ? getServicePlans(bookingService, date, time)
    : Object.fromEntries(
        generatedPlans.map((plan, index) => [plan.id, toServicePlan(plan, request, index)]),
      )
  const activeIds: PlanId[] = bookingService
    ? PLAN_IDS
    : generatedPlans.map((plan) => plan.id)
  const activeStates: Partial<Record<PlanId, PlanState>> = bookingService
    ? planStates(getServicePlans(bookingService, date, time), teamFor, date, time)
    : generatedPlanStates(generatedPlans, request)
  const selectedPlan: PlanId = activeIds.includes(rawSelectedPlan)
    ? rawSelectedPlan
    : (bestGenerated?.id ?? rawSelectedPlan)
  const moveBookingDate = (nextDate: string) => {
    setDate(nextDate)
    notify(`Moved to ${shortDate(nextDate)}`)
  }
  const selectedServicePlan = bookingService
    ? getServicePlans(bookingService, date, time)[selectedPlan]
    : null

  const homeProps = {
    onNavigate: navigateMain,
    openProvider,
    openProfile: () => setProfileOpen(true),
    openUpcomingTask: () => {
      if (nextUpcoming) openBooking(nextUpcoming.id)
    },
    upcoming: nextUpcoming,
    requestText: composerRequest,
    searchLoading,
    setRequestText: setComposerRequest,
    submitRequest: submitHomeRequest,
    taskNotice: booked,
    savedProviders,
    toggleSaved,
  }

  return (
    <div className="prototype-stage">
      <div className="phone-frame">
        <StatusBar />
        {view === "booking" && screen === 1 && <HomeScreen {...homeProps} />}
        {view === "booking" && screen === 2 && (
          <ConfirmDetailsScreen
            access={access}
            address={address}
            back={() => {
              if (returnToReview) {
                setReturnToReview(false)
                setScreen(5)
              } else if (bookingService && bookingReturn !== "booking") {
                setView(bookingReturn)
              } else setScreen(1)
            }}
            initialSection={editSection}
            onAddTasks={addToRequest}
            priceChange={priceChange}
            onAnswer={(taskId, questionId, value) =>
              setRequest((current) => answerTaskQuestion(current, taskId, questionId, value))
            }
            onClarify={(option) =>
              setRequest((current) => resolveClarification(current, option))
            }
            onDateWindow={(value) =>
              updateRequest((current) => ({ ...current, datePreference: value }))
            }
            plannedHours={plannedHours}
            request={request}
            returning={returnToReview}
            service={bookingService}
            bookingTasks={bookingTasks}
            date={date}
            ingredients={ingredients}
            next={() => {
              setEditSection(null)
              if (returnToReview) {
                setReturnToReview(false)
                setScreen(5)
              } else {
                const best = activeIds.find(
                  (id) => activeStates[id]?.tag === "Recommended",
                )
                if (best) setSelectedPlan(best)
                setScreen(3)
              }
            }}
            setAccess={setAccess}
            setAddress={setAddress}
            setBookingTasks={setBookingTasks}
            setDate={setDate}
            setIngredients={setIngredients}
            setTime={setTime}
            time={time}
          />
        )}
        {view === "booking" && screen === 3 && activePlans[selectedPlan] && (
          <ChoosePlanScreen
            back={() => {
              if (returnToReview) {
                setReturnToReview(false)
                setScreen(5)
              } else setScreen(2)
            }}
            bestTeam={bestIdsFor}
            photoFor={(plan) =>
              photoAt(
                bookingService?.title ?? activePlans[plan]?.photoKey ?? "Your Service Plan",
                1200,
              )
            }
            canSeeMatches={(plan) => firstMatchSlot(plan) >= 0}
            next={(plan) => {
              const later = activeStates[plan]?.issue?.nextDate
              if (later) moveBookingDate(later)
              setSelectedPlan(plan)
              setReturnToReview(false)
              setPriceChange(null)
              setScreen(5)
            }}
            onOpenHelper={openProvider}
            onSeeMatches={(plan) =>
              setHelperPicker({ plan, slot: Math.max(firstMatchSlot(plan), 0) })
            }
            gaps={packageGapsFor}
            planIds={activeIds}
            plans={activePlans}
            priceChange={priceChange}
            scheduleLabel={date}
            selected={selectedPlan}
            setSelected={setSelectedPlan}
            states={activeStates}
            tasks={bookingTasks}
            taskHours={request.tasks.map((task) => task.estimatedDuration)}
            teamFor={teamFor}
            timeLabel={(plan) => {
              const start = parseRangeStart(time)
              return timePreference?.kind === "exact" && start !== null
                ? formatRange(start, plan.hours)
                : timePreference?.kind === "flexible"
                  ? "Helper confirms a time"
                  : `${describeTime(timePreference).label} · Helper confirms a time`
            }}
          />
        )}
        {view === "booking" && screen === 5 && activePlans[selectedPlan] && (
          <ReviewPayScreen
            access={access}
            address={address}
            back={() => setScreen(3)}
            booked={completeBooking}
            service={bookingService}
            bookingTasks={bookingTasks}
            date={date}
            editRequest={(section) => {
              setEditSection(section)
              setReturnToReview(true)
              setScreen(2)
            }}
            ingredients={ingredients}
            paymentMethod={paymentMethod}
            onOpenHelper={openProvider}
            team={teamFor(selectedPlan)}
            canSeeMatches={firstMatchSlot(selectedPlan) >= 0}
            onChangeHelper={() =>
              setHelperPicker({
                plan: selectedPlan,
                slot: Math.max(firstMatchSlot(selectedPlan), 0),
              })
            }
            issue={activeStates[selectedPlan]?.issue ?? null}
            moveDate={moveBookingDate}
            plan={activePlans[selectedPlan]!}
            request={request}
            selectedPlan={selectedPlan}
            setPaymentMethod={setPaymentMethod}
            time={time}
          />
        )}
        {view === "explore" && (
          <ExploreScreen
            chooseService={(title) => {
              setActiveService(title)
              setView("service")
            }}
            onNavigate={navigateMain}
            openProvider={openProvider}
            query={exploreQuery}
            seeAllHelpers={(query) => openHelpers(null, query)}
            setQuery={setExploreQuery}
          />
        )}
        {view === "helpers" && (
          <AllHelpersScreen
            back={() => setView(helpersReturn)}
            book={(id) => bookHelper(id, helpersScope)}
            initialQuery={helpersQuery}
            openProvider={openProvider}
            scope={helpersScope ? services[helpersScope] : null}
          />
        )}
        {view === "service" && (
          <ServiceDetailScreen
            back={() => setView("explore")}
            book={() => startServiceBooking(services[activeService])}
            key={activeService}
            openProvider={openProvider}
            openService={setActiveService}
            seeAllHelpers={() => openHelpers(activeService, "")}
            service={services[activeService]}
          />
        )}
        {view === "booking" && screen === 6 && lastBooking && (
          <NewConfirmation
            booking={lastBooking}
            onNavigate={navigateMain}
            viewTask={() => {
              setSelectedTask(null)
              setView("tasks")
            }}
          />
        )}
        {view === "tasks" && (
          <TasksPage
            booked={booked}
            bookings={bookings}
            goHome={() => navigateMain("home")}
            onNavigate={navigateMain}
            openProvider={openProvider}
            openInbox={() => {
              setMessageOrigin("tasks")
              setView("inbox")
            }}
            openTask={openBooking}
          />
        )}
        {view === "saved" && (
          <SavedPage
            customize={(prefill) => {
              if (/weekly meal/i.test(prefill)) {
                startServiceBooking(services["Weekly meal preparation"])
                return
              }
              openComposer(prefill)
              setBookingTasks(defaultBookingTasks)
              setSelectedPlan("team")
            }}
            goHome={() => navigateMain("home")}
            onNavigate={navigateMain}
            openInbox={() => {
              setMessageOrigin("saved")
              setView("inbox")
            }}
            openProvider={(id) => openProvider(id)}
            savedProviders={savedProviders}
            toggleSaved={toggleSaved}
          />
        )}
        {view === "messages" && (
          <MessagesPage
            back={() => setView(returnView)}
            key={messageProviderId ?? "plan"}
            providerId={messageProviderId}
          />
        )}
        {view === "plan-details" && planDetailsBooking && (
          <BookedPlanDetails
            back={() => setView(planReturnView)}
            bookAgain={
              planDetailsBooking.serviceTitle
                ? () =>
                    startServiceBooking(
                      services[planDetailsBooking.serviceTitle as string],
                      planDetailsBooking.helperIds[0],
                    )
                : () => {
                    openComposer()
                    setBookingTasks(planDetailsBooking.tasks)
                    setSelectedPlan("team")
                  }
            }
            booking={planDetailsBooking}
            manage={() => setManageBookingId(planDetailsBooking.id)}
            onCalendarAdded={() => markCalendarAdded(planDetailsBooking.id)}
            message={() => {
              setMessageOrigin("tasks")
              setThreadBookingId(
                planDetailsBooking.serviceTitle ? planDetailsBooking.id : null,
              )
              setView("thread")
            }}
            onNavigate={navigateMain}
            openProvider={openProvider}
          />
        )}
        {view === "inbox" && (
          <MessagesInbox
            back={() => setView(messageOrigin)}
            onNavigate={navigateMain}
            bookings={bookings.filter(
              (item) => item.serviceTitle && item.id !== "tailoring",
            )}
            openThread={(bookingId) => {
              setThreadBookingId(bookingId)
              setView("thread")
            }}
            origin={messageOrigin}
          />
        )}
        {view === "thread" && (
          <HelpersMessageThread
            back={() => setView("inbox")}
            booking={threadBooking}
            key={threadBookingId ?? "plan"}
            onNavigate={navigateMain}
            openProvider={openProvider}
            origin={messageOrigin}
          />
        )}
        {view === "ui-kit" && <UIKitScreen back={() => navigateMain("home")} />}
        {selectedTask && (
          <TaskDetailsSheet
            bookAgain={(prefill) => {
              if (selectedTask === "meal-prep") {
                setSelectedTask(null)
                startServiceBooking(services["Weekly meal preparation"], "maria")
                return
              }
              openComposer(prefill)
              setSelectedPlan("team")
              if (selectedTask === "organization") {
                setSelectedBookingHelper("jasmine")
                updateRequest((current) => ({ ...current, selectedHelpers: ["jasmine"] }))
                setBookingTasks([
                  "Closet organization",
                  "Cabinet organization",
                  "Living room reset",
                ])
              } else {
                setBookingTasks(defaultBookingTasks)
              }
            }}
            booking={bookings.find((item) => item.id === selectedTask)}
            manage={() => {
              setManageBookingId(selectedTask)
              setSelectedTask(null)
            }}
            onCalendarAdded={() => markCalendarAdded(selectedTask)}
            close={() => setSelectedTask(null)}
            openProvider={(id) => {
              setSelectedTask(null)
              openProvider(id)
            }}
            openMessages={() => {
              setMessageProviderId(
                selectedTask === "tailoring"
                  ? "clara"
                  : selectedTask === "organization"
                    ? "jasmine"
                    : "maria",
              )
              setSelectedTask(null)
              setReturnView(view)
              setView("messages")
            }}
            task={selectedTask}
          />
        )}
        {helperPicker && inBooking && (
          <HelperPicker
            availabilityLine={matchAvailability(helperPicker.plan)}
            bestIds={bestIdsFor(helperPicker.plan)}
            apply={(team) => {
              setPlanTeams((current) => ({ ...current, [helperPicker.plan]: team }))
              setPriceChange(null)
              setHelperPicker(null)
            }}
            close={() => setHelperPicker(null)}
            extraCost={(id) => replacementCost(helperPicker.plan, helperPicker.slot, id)}
            openProfile={openProvider}
            options={matchOptions(helperPicker.plan, helperPicker.slot)}
            rows={Math.max(
              ...teamFor(helperPicker.plan).map(
                (_, slot) => matchOptions(helperPicker.plan, slot).length,
              ),
            )}
            roles={activePlans[helperPicker.plan]?.roles ?? []}
            setSlot={(slot) => setHelperPicker({ ...helperPicker, slot })}
            slot={helperPicker.slot}
            team={teamFor(helperPicker.plan)}
          />
        )}
        {selectedProvider && (
          <ProviderProfileSheet
            choose={() => {
              if (!selectedProvider) return
              if (inBooking) {
                const plan = helperPicker?.plan ?? selectedPlan
                const team = teamFor(plan)
                const slot = helperPicker?.slot ?? Math.max(team.indexOf(selectedProvider), 0)
                if (team[slot] === selectedProvider) {
                  setHelperPicker(null)
                } else if (team.includes(selectedProvider)) {
                  notify("Already on this plan")
                } else if (!matchOptions(plan, slot).includes(selectedProvider)) {
                  notify("Not available for this plan")
                } else {
                  assignHelper(plan, slot, selectedProvider)
                  setHelperPicker(null)
                }
                setSelectedProvider(null)
                return
              }
              bookHelper(
                selectedProvider,
                view === "service"
                  ? activeService
                  : view === "helpers"
                    ? helpersScope
                    : null,
              )
            }}
            close={() => setSelectedProvider(null)}
            message={() => {
              setMessageProviderId(selectedProvider)
              setSelectedProvider(null)
              setReturnView(view)
              setView("messages")
            }}
            planContext={inBooking}
            actionLabel={
              inBooking
                ? bestIdsFor(helperPicker?.plan ?? selectedPlan).includes(selectedProvider)
                  ? "Keep best match"
                  : "Select this helper"
                : undefined
            }
            availabilityLabel={
              inBooking ? matchAvailability(helperPicker?.plan ?? selectedPlan) : undefined
            }
            assignedTask={
              inBooking
                ? (activePlans[helperPicker?.plan ?? selectedPlan]?.roles?.[
                    helperPicker?.slot ??
                      Math.max(teamFor(helperPicker?.plan ?? selectedPlan).indexOf(selectedProvider), 0)
                  ] ?? bookingService?.title ?? "Your request")
                : undefined
            }
            planTotal={
              selectedServicePlan
                ? selectedServicePlan.total
                : (() => {
                    const plan = generatedFor(helperPicker?.plan ?? selectedPlan)
                    if (!plan) return "$0 total"
                    const slot = helperPicker?.slot ?? 0
                    const eligible = helperChoices(plan.id, slot).includes(selectedProvider)
                    return eligible
                      ? `$${replacementTotal(request, plan, slot, selectedProvider)} total`
                      : `$${plan.price.total} total`
                  })()
            }
            providerId={selectedProvider}
            remove={() => {
              toggleSaved(selectedProvider)
            }}
          />
        )}
        {manageBooking && (
          <ManageBookingSheet
            booking={manageBooking}
            cancel={() => {
              updateBooking(manageBooking.id, {
                status: "cancelled",
                statusLabel: "Cancelled",
                homeLabel: undefined,
              })
              setManageBookingId(null)
              notify("Booking cancelled")
            }}
            close={() => setManageBookingId(null)}
            key={manageBooking.id}
            update={(patch, message) => {
              updateBooking(manageBooking.id, patch)
              setManageBookingId(null)
              notify(message)
            }}
          />
        )}
        {profileOpen && (
          <ProfileDrawer
            close={() => setProfileOpen(false)}
            notify={notify}
            openUIKit={() => setView("ui-kit")}
          />
        )}
        {toast && <Toast message={toast} />}
        <HomeIndicator />
      </div>
    </div>
  )
}

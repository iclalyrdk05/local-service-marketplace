export type TaskCategory =
  | "cleaning"
  | "laundry"
  | "meal-prep"
  | "organization"
  | "tailoring"
  | "personal-care"
  | "other"

export type DayPart = "morning" | "afternoon" | "evening"

/** Dates are ISO strings (YYYY-MM-DD). */
export type DatePreference =
  | { kind: "specific"; date: string }
  | { kind: "window"; start: string; end: string; label: string; flexible: boolean }
  | { kind: "deadline"; date: string }
  | { kind: "flexible"; start: string; end: string }

export type TimePreference =
  | { kind: "exact"; hour: number }
  | { kind: "part"; part: DayPart }
  | { kind: "before"; hour: number }
  | { kind: "after"; hour: number }
  | { kind: "before-part"; part: DayPart }
  | { kind: "flexible" }

export type ServiceTask = {
  id: string
  category: TaskCategory
  title: string
  description?: string
  details: Record<string, unknown>
  answers: Record<string, string>
  datePreference?: DatePreference
  timePreference?: TimePreference
  estimatedDuration: number
  status: "draft" | "confirmed"
  /** The user's own words for this task. */
  sourceText?: string
}

export type Question = {
  id: string
  taskId?: string
  category?: TaskCategory
  label: string
  options: string[]
  blocking: boolean
}

export type ClarificationOption = {
  label: string
  apply:
    | { kind: "set-category"; taskId: string; category: TaskCategory }
    | { kind: "keep-task"; taskId: string }
    | { kind: "remove-task"; taskId: string }
    | { kind: "set-date"; date: DatePreference }
}

/** The parser asks at most one of these at a time. */
export type Clarification = {
  question: string
  originalWording: string
  options: ClarificationOption[]
}

export type MissingField = "tasks" | "date" | "time" | "location"

export type ServiceRequest = {
  rawText: string
  tasks: ServiceTask[]
  datePreference?: DatePreference
  timePreference?: TimePreference
  location?: string
  access?: string
  ingredients?: string
  unansweredQuestions: Question[]
  missing: MissingField[]
  clarification?: Clarification
  confidence: "high" | "low"
  /** Plain-language notes about what a follow-up instruction changed. */
  notices: string[]
  selectedPlanId?: string
  selectedHelpers?: string[]
}

export type PlanId = "solo" | "team" | "split"

export type PriceBreakdown = {
  labor: number
  /** Labor split by kind of work, in the order the tasks appear. */
  lines: Array<{ label: string; amount: number }>
  extras: Array<{ label: string; amount: number }>
  fee: number
  total: number
}

export type PlanPart = {
  taskIds: string[]
  hours: number
  primary: boolean
  date?: DatePreference
  time?: TimePreference
}

export type PlanAssignment = {
  helperId: string
  role: string
  taskIds: string[]
  hours: number
  parts: PlanPart[]
}

export type PlanAvailability =
  | { status: "fits"; date: string }
  | {
      status: "later"
      helperId: string
      nextDate: string | null
      blockedLabel: string
    }

export type GeneratedPlan = {
  id: PlanId
  title: string
  description: string
  assignments: PlanAssignment[]
  helperIds: string[]
  /** Elapsed hours from arrival to finish. */
  hours: number
  /** More than one when a long job is spread across days. */
  visits: number
  concurrent: boolean
  availability: PlanAvailability
  price: PriceBreakdown
  score: number
  isBest: boolean
  isFastest: boolean
  /** One-line comparison against the best match. */
  tradeoff: string
  /** The same comparison without the plan title, for compact rows. */
  tradeoffParts: string[]
}

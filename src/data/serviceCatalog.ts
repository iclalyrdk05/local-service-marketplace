import type { ServiceTask, TaskCategory } from "../types"

export type CatalogQuestion = {
  id: string
  label: string
  options: string[]
  blocking?: boolean
  /** Hide the question unless this returns true. */
  when?: (task: ServiceTask) => boolean
}

export type CatalogEntry = {
  name: string
  roleLabel: string
  /** Whether a helper must come inside the home. */
  entersHome: boolean
  /** Whether two people can share this one task. */
  canShare: boolean
  /** Can happen in the same home visit as other tasks. */
  sameVisit: boolean
  photoKey: string
  questions: CatalogQuestion[]
}

export const serviceCatalog: Record<TaskCategory, CatalogEntry> = {
  cleaning: {
    name: "Cleaning",
    roleLabel: "Cleaning",
    entersHome: true,
    canShare: true,
    sameVisit: true,
    photoKey: "Guest ready",
    questions: [
      { id: "size", label: "Home size", options: ["Studio", "1 bedroom", "2 bedrooms", "3+ bedrooms"], blocking: true, when: (task) => task.details.scope !== "rooms" && task.details.scope !== "items" },
      { id: "scope", label: "What should be cleaned?", options: ["Full home", "Selected rooms"], blocking: true, when: (task) => task.details.scope !== "items" },
      { id: "depth", label: "Cleaning type", options: ["Standard", "Deep clean"] },
      { id: "supplies", label: "Supplies", options: ["I have supplies", "Helper brings supplies"] },
      { id: "home", label: "Will you be home?", options: ["I’ll be home", "I won’t be home"] },
    ],
  },
  laundry: {
    name: "Laundry",
    roleLabel: "Laundry",
    entersHome: true,
    canShare: false,
    sameVisit: true,
    photoKey: "Wardrobe organization",
    questions: [
      { id: "loads", label: "About how many loads?", options: ["1–2", "3–4", "5+"], blocking: true },
      { id: "service", label: "Service", options: ["Wash and fold", "Wash only"] },
      { id: "ironing", label: "Ironing", options: ["Yes", "No"] },
      { id: "machine", label: "Where will it be washed?", options: ["At-home washer and dryer", "Pickup and return"], blocking: true },
    ],
  },
  "meal-prep": {
    name: "Meal preparation",
    roleLabel: "Meal prep",
    entersHome: true,
    canShare: false,
    sameVisit: true,
    photoKey: "Home-cooked meals",
    questions: [
      { id: "meals", label: "How many meals?", options: ["3", "5", "7"], blocking: true, when: (task) => task.details.weekly === true },
      { id: "servings", label: "Servings per meal", options: ["1–2", "3–4", "5–6", "7+"], blocking: true },
      { id: "diet", label: "Dietary preference", options: ["No preference", "Vegetarian", "Vegan", "Gluten-free"] },
      { id: "allergies", label: "Any allergies?", options: ["None", "Yes, I’ll share them"], blocking: true },
    ],
  },
  organization: {
    name: "Organization",
    roleLabel: "Organization",
    entersHome: true,
    canShare: true,
    sameVisit: true,
    photoKey: "Wardrobe organization",
    questions: [
      { id: "area", label: "Which cabinets?", options: ["Kitchen", "Bathroom", "Closet"], blocking: true, when: (task) => task.details.cabinets === true },
      { id: "area", label: "Which area?", options: ["Closet", "Kitchen", "Pantry", "Whole room", "Garage"], blocking: true, when: (task) => task.details.cabinets !== true },
      { id: "size", label: "Approximate size", options: ["Small", "Medium", "Large"] },
      { id: "mode", label: "What should happen?", options: ["Organize only", "Declutter too"] },
      { id: "donate", label: "Can items be donated or discarded?", options: ["Yes", "Ask me first", "No"], when: (task) => task.answers.mode === "Declutter too" },
    ],
  },
  tailoring: {
    name: "Tailoring",
    roleLabel: "Tailoring",
    entersHome: false,
    canShare: false,
    sameVisit: false,
    photoKey: "Tailoring",
    questions: [
      { id: "garment", label: "What type of garment?", options: ["Dress", "Pants", "Shirt", "Jacket", "Other"], blocking: true },
      { id: "count", label: "How many garments?", options: ["1", "2", "3", "4+"], blocking: true },
      { id: "alteration", label: "What needs changing?", options: ["Shorten", "Take in", "Let out", "Repair"] },
      { id: "mode", label: "How should it be handled?", options: ["At-home fitting", "Provider location", "Pickup and return"], blocking: true },
    ],
  },
  "personal-care": {
    name: "Personal care",
    roleLabel: "Personal care",
    entersHome: true,
    canShare: false,
    sameVisit: true,
    photoKey: "Styling",
    questions: [
      { id: "preferences", label: "Anything to plan for?", options: ["No preference", "Sensitive skin", "I have my own products"] },
    ],
  },
  other: {
    name: "Other help",
    roleLabel: "General help",
    entersHome: true,
    canShare: false,
    sameVisit: true,
    photoKey: "Your Service Plan",
    questions: [],
  },
}

export type TaskAlias = { category: TaskCategory; pattern: RegExp }

/** Checked in order. Earlier entries claim their words first. */
export const taskAliases: TaskAlias[] = [
  { category: "laundry", pattern: /\b(?:laundry|wash and fold|wash-and-fold|dry[- ]?clean\w*|ironing|iron (?:my|the|some)\b[a-z ]*?\b(?:shirts?|clothes|sheets)|wash (?:my|the|some) (?:clothes|sheets|towels|shirts?))\b/g },
  { category: "tailoring", pattern: /\b(?:alter(?:ed|ing|ations?)?|tailor(?:ed|ing)?|hem(?:med|ming|s)?|shorten(?:ed|ing)?|take in|taken in|let out|mend(?:ed|ing)?|(?:fix|repair)(?:ed|ing)? (?:my|the|a|some)\s+(?:[a-z]+\s+)?(?:dress|pants|jeans|shirt|suit|jacket|skirt|coat|blouse|zipper)s?)\b/g },
  { category: "personal-care", pattern: /\b(?:eyebrows?|brows?|threading|makeup|make-up|manicure|pedicure|facial|hair styling|blowout|styling appointment|personal styling|beauty)\b/g },
  { category: "meal-prep", pattern: /\b(?:meal[- ]?prep\w*|meals?|cook(?:ing|ed)?|chef|dinner|lunch|brunch|breakfast)\b/g },
  { category: "organization", pattern: /\b(?:organi[sz]\w*|declutter\w*|sort out|closet systems?|(?:winter|summer|spring|fall|seasonal) (?:clothes|clothing|wardrobe))\b/g },
  { category: "cleaning", pattern: /\b(?:deep[- ]?clean\w*|spring[- ]?clean\w*|house[- ]?clean\w*|clean(?:ing|ed|er)?|housekeeping|scrub\w*|vacuum\w*|mop\w*|dusting|tidy(?:ing)?|reset|ready for guests|guest[- ]ready)\b/g },
]

/** Requests we recognize as real work but do not have a category for. */
export const otherActionWords =
  /^(?:walk|fix|repair|mount|assemble|install|paint|move|plant|water|deliver|babysit|watch|feed|pick up|drive|mow|rake|shovel|hang)\b/

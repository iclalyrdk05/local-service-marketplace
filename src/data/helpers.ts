import type { TaskCategory } from "../types"
import { weekdayName } from "../lib/schedule"

export type Provider = {
  id: string
  initials: string
  name: string
  service: string
  rating: string
  completed: number
  availability: string
  rate: string
  skills: string[]
  match: string
  /** Skill level from 0 to 1 for each kind of work this helper accepts. */
  capabilities: Partial<Record<TaskCategory, number>>
  verified: boolean
  serviceAreas: string[]
  /** Exceptions to the default hours. Null means a day off. */
  workingHours: Record<string, [number, number] | null>
}

const MANHATTAN_BROOKLYN = ["Manhattan", "Brooklyn"]

export const providers: Provider[] = [
  {
    id: "maria",
    initials: "MG",
    name: "Maria G.",
    service: "Home Cooking",
    rating: "4.9",
    completed: 128,
    availability: "Available Wednesday",
    rate: "$42/hour",
    skills: ["In-home cooking", "Meal preparation", "Dinner service"],
    match: "Experienced with in-home dinner preparation and available for your plan.",
    capabilities: { "meal-prep": 0.98, cleaning: 0.7, organization: 0.7, laundry: 0.6, other: 0.4 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Saturday: [9, 16.5], Thursday: null },
  },
  {
    id: "jasmine",
    initials: "JR",
    name: "Jasmine R.",
    service: "Home Organization",
    rating: "4.8",
    completed: 96,
    availability: "Available Saturday",
    rate: "$45/hour",
    skills: ["Kitchen organization", "Cabinet systems", "Home reset"],
    match: "Experienced with kitchen and cabinet organization.",
    capabilities: { organization: 0.98, cleaning: 0.85, laundry: 0.6, other: 0.5 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Saturday: [10, 18], Wednesday: null },
  },
  {
    id: "clara",
    initials: "CW",
    name: "Clara W.",
    service: "Tailoring",
    rating: "4.9",
    completed: 102,
    availability: "Available Thursday",
    rate: "$38/hour",
    skills: ["Alterations", "Hemming", "Garment fitting"],
    match: "Available Thursday and experienced with garment alterations.",
    capabilities: { tailoring: 0.98 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Saturday: [12, 18], Sunday: null },
  },
  {
    id: "nora",
    initials: "NP",
    name: "Nora P.",
    service: "Home Cooking",
    rating: "4.8",
    completed: 88,
    availability: "Available Saturday",
    rate: "$38/hour",
    skills: ["Meal preparation", "Batch cooking"],
    match: "A strong fit for efficient meal preparation and batch cooking.",
    capabilities: { "meal-prep": 0.9, organization: 0.6 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Saturday: [10, 17], Monday: null },
  },
  {
    id: "elena",
    initials: "EM",
    name: "Elena M.",
    service: "Meal Preparation",
    rating: "4.9",
    completed: 116,
    availability: "Available Saturday",
    rate: "$44/hour",
    skills: ["Meal preparation", "Grocery planning", "Family-style cooking"],
    match: "Available at your time with a strong cooking match.",
    capabilities: { "meal-prep": 0.95 },
    verified: true,
    serviceAreas: ["Manhattan"],
    workingHours: { Saturday: [11, 17], Tuesday: null },
  },
  {
    id: "sofia",
    initials: "SK",
    name: "Sofia K.",
    service: "Family-Style Cooking",
    rating: "4.8",
    completed: 93,
    availability: "Available Saturday",
    rate: "$43/hour",
    skills: ["Family meals", "Dinner service", "Kitchen reset"],
    match: "Highly rated for family-style cooking and clean kitchens.",
    capabilities: { "meal-prep": 0.92, cleaning: 0.6 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Saturday: [12, 17], Friday: null },
  },
  {
    id: "nina",
    initials: "NP",
    name: "Nina P.",
    service: "Vegetarian Meal Preparation",
    rating: "4.9",
    completed: 104,
    availability: "Available Saturday",
    rate: "$46/hour",
    skills: ["Vegetarian meals", "Ingredient planning", "Batch cooking"],
    match: "Strong vegetarian cooking match and previously hired nearby.",
    capabilities: { "meal-prep": 0.9 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Saturday: [12, 17] },
  },
  {
    id: "selin",
    initials: "SA",
    name: "Selin A.",
    service: "Styling and Beauty",
    rating: "4.9",
    completed: 87,
    availability: "Available Saturday",
    rate: "$60/hour",
    skills: ["Personal styling", "At-home beauty", "Occasion looks"],
    match: "Highly rated for relaxed at-home styling appointments.",
    capabilities: { "personal-care": 0.97 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Sunday: null },
  },
  {
    id: "dara",
    initials: "DK",
    name: "Dara K.",
    service: "Threading and Beauty",
    rating: "4.8",
    completed: 74,
    availability: "Available Saturday",
    rate: "$55/hour",
    skills: ["Eyebrow threading", "At-home beauty", "Skin care"],
    match: "Precise threading and gentle at-home beauty services.",
    capabilities: { "personal-care": 0.92 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Sunday: null },
  },
  {
    id: "priya",
    initials: "PS",
    name: "Priya S.",
    service: "Home Cleaning",
    rating: "4.9",
    completed: 141,
    availability: "Available Friday",
    rate: "$40/hour",
    skills: ["Full home cleaning", "Deep cleaning", "Laundry care"],
    match: "Trusted for thorough whole-home cleans and laundry.",
    capabilities: { cleaning: 0.97, laundry: 0.92, organization: 0.6, other: 0.4 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Monday: null },
  },
  {
    id: "tomas",
    initials: "TR",
    name: "Tomas R.",
    service: "Cleaning and Laundry",
    rating: "4.7",
    completed: 83,
    availability: "Available Thursday",
    rate: "$36/hour",
    skills: ["Apartment cleaning", "Wash and fold", "Ironing"],
    match: "Reliable for regular cleaning and wash-and-fold laundry.",
    capabilities: { cleaning: 0.9, laundry: 0.88 },
    verified: true,
    serviceAreas: ["Manhattan"],
    workingHours: { Sunday: null },
  },
  {
    id: "mei",
    initials: "ML",
    name: "Mei L.",
    service: "Alterations and Garment Care",
    rating: "4.8",
    completed: 69,
    availability: "Available Wednesday",
    rate: "$41/hour",
    skills: ["Hemming", "Formalwear alterations", "Garment care"],
    match: "Careful with formalwear alterations and quick turnarounds.",
    capabilities: { tailoring: 0.93, laundry: 0.65 },
    verified: true,
    serviceAreas: MANHATTAN_BROOKLYN,
    workingHours: { Monday: null },
  },
]

export const helperPhotos: Record<string, string> = {
  maria:
    "https://images.unsplash.com/photo-1758600587839-56ba05596c69?crop=faces&fit=crop&w=160&h=160&q=80",
  jasmine:
    "https://images.unsplash.com/photo-1758600436770-821223436cdc?crop=faces&fit=crop&w=160&h=160&q=80",
  nora: "https://images.unsplash.com/photo-1770058443069-e384cd001e9b?crop=faces&fit=crop&w=160&h=160&q=80",
  clara:
    "https://images.unsplash.com/photo-1607749091702-1bab1be215a4?crop=faces&fit=crop&w=160&h=160&q=80",
  elena:
    "https://images.unsplash.com/photo-1604672840443-4f625b139ec5?crop=faces&fit=crop&w=160&h=160&q=80",
  sofia:
    "https://images.unsplash.com/photo-1620281487215-6ac3a5876836?crop=faces&fit=crop&w=160&h=160&q=80",
  nina: "https://images.unsplash.com/photo-1685703207080-efd7400e9334?crop=faces&fit=crop&w=160&h=160&q=80",
  selin:
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=faces&fit=crop&w=160&h=160&q=80",
  dara: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?crop=faces&fit=crop&w=160&h=160&q=80",
  priya:
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=faces&fit=crop&w=160&h=160&q=80",
  tomas:
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=faces&fit=crop&w=160&h=160&q=80",
  mei:
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?crop=faces&fit=crop&w=160&h=160&q=80",
}

const DEFAULT_HOURS: [number, number] = [9, 21]

export function providerById(id: string) {
  return providers.find((item) => item.id === id)
}

export function hourlyRate(provider: Provider) {
  return Number(provider.rate.replace(/[^\d.]/g, ""))
}

export function workingHoursOn(provider: Provider, iso: string) {
  const custom = provider.workingHours[weekdayName(iso)]
  return custom === null ? null : (custom ?? DEFAULT_HOURS)
}

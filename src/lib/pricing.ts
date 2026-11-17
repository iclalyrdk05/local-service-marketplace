import { hourlyRate, providerById } from "../data/helpers"
import { serviceCatalog } from "../data/serviceCatalog"
import type { PlanAssignment, PriceBreakdown, ServiceRequest } from "../types"

const EXTRA_HELPER_ARRIVAL = 18
const EXTRA_VISIT = 12
const SPECIALIST_COORDINATION = 30
const SHOPPING = 25
const PICKUP_AND_RETURN = 15
const FEE_RATE = 0.12

export function priceAssignments(
  request: ServiceRequest,
  assignments: PlanAssignment[],
  separateVisits: number,
): PriceBreakdown {
  const byLabel = new Map<string, number>()
  for (const assignment of assignments) {
    const helper = providerById(assignment.helperId)
    const cost = assignment.hours * (helper ? hourlyRate(helper) : 40)
    const tasks = request.tasks.filter((task) => assignment.taskIds.includes(task.id))
    const weight = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0) || 1
    for (const task of tasks) {
      const label = serviceCatalog[task.category].name
      byLabel.set(label, (byLabel.get(label) ?? 0) + (cost * task.estimatedDuration) / weight)
    }
  }
  const labor = Math.round([...byLabel.values()].reduce((sum, value) => sum + value, 0))
  const lines = [...byLabel].map(([label, amount]) => ({ label, amount: Math.round(amount) }))
  // Rounding each line can drift by a dollar, so the last line absorbs it.
  if (lines.length) {
    lines[lines.length - 1].amount += labor - lines.reduce((sum, line) => sum + line.amount, 0)
  }
  const extras: PriceBreakdown["extras"] = []
  const helpers = new Set(assignments.map((item) => item.helperId)).size
  if (helpers > 1) {
    extras.push({ label: "Additional helper", amount: EXTRA_HELPER_ARRIVAL * (helpers - 1) })
  }
  if (helpers >= 3) {
    extras.push({ label: "Specialist coordination", amount: SPECIALIST_COORDINATION })
  }
  if (separateVisits > 0) {
    extras.push({ label: "Separate appointment", amount: EXTRA_VISIT * separateVisits })
  }
  if (request.ingredients === "Helper shops for ingredients") {
    extras.push({ label: "Grocery shopping", amount: SHOPPING })
  }
  const pickups = request.tasks.filter(
    (task) => task.answers.machine === "Pickup and return" || task.answers.mode === "Pickup and return",
  ).length
  if (pickups > 0) extras.push({ label: "Pickup and return", amount: PICKUP_AND_RETURN * pickups })
  const subtotal = labor + extras.reduce((sum, item) => sum + item.amount, 0)
  const fee = Math.round(subtotal * FEE_RATE)
  return { labor, lines, extras, fee, total: subtotal + fee }
}

export function priceDifference(amount: number) {
  if (amount === 0) return "Same total"
  return amount > 0 ? `$${amount} more` : `$${Math.abs(amount)} less`
}

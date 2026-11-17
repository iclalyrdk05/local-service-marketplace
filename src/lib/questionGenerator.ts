import { serviceCatalog } from "../data/serviceCatalog"
import type { MissingField, Question, ServiceRequest, ServiceTask } from "../types"

const MAX_QUESTIONS_PER_TASK = 3

export function needsHomeAccess(request: ServiceRequest) {
  return request.tasks.some(
    (task) =>
      serviceCatalog[task.category].entersHome || task.answers.mode === "At-home fitting",
  )
}

export function includesMeals(request: ServiceRequest) {
  return request.tasks.some((task) => task.category === "meal-prep")
}

/** Questions we ask for this task: only the ones a plan depends on. */
export function requiredQuestions(task: ServiceTask) {
  return serviceCatalog[task.category].questions.filter(
    (item) => item.blocking && (!item.when || item.when(task)),
  )
}

/** Required questions still open for one task, a few at a time. */
export function questionsForTask(task: ServiceTask): Question[] {
  return requiredQuestions(task)
    .filter((item) => !task.answers[item.id])
    .slice(0, MAX_QUESTIONS_PER_TASK)
    .map((item) => ({
      id: item.id,
      taskId: task.id,
      category: task.category,
      label: item.label,
      options: item.options,
      blocking: Boolean(item.blocking),
    }))
}

/** How many required questions are still open across the request. */
export function openRequiredCount(request: ServiceRequest) {
  return request.tasks.reduce((sum, task) => sum + questionsForTask(task).length, 0)
}

export function generateQuestions(request: ServiceRequest): Question[] {
  const questions = request.tasks.flatMap(questionsForTask)
  if (includesMeals(request) && !request.ingredients) {
    questions.push({
      id: "ingredients",
      label: "How should ingredients be handled?",
      options: ["Use what I have", "Helper shops for ingredients", "Decide later"],
      blocking: false,
    })
  }
  if (needsHomeAccess(request) && !request.access) {
    questions.push({
      id: "access",
      label: "How will the helper get in?",
      options: ["Doorman", "Smart-lock code", "Lockbox", "Arrange later"],
      blocking: false,
    })
  }
  return questions
}

export function findMissing(request: ServiceRequest): MissingField[] {
  const missing: MissingField[] = []
  if (request.tasks.length === 0) missing.push("tasks")
  if (!request.datePreference) missing.push("date")
  if (!request.timePreference) missing.push("time")
  if (!request.location) missing.push("location")
  return missing
}

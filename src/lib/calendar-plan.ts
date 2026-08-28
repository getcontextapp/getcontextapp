import { addDaysToKey } from '@/lib/task-scheduling'

export function isPlanForDisplayedDate(plannedFor: string, displayedDate: string) {
  return plannedFor === displayedDate
}

export function calendarPlanAddedMessage(plannedFor: string, todayKey: string) {
  if (plannedFor === todayKey) return "Added to today's Context plan."
  if (plannedFor === addDaysToKey(todayKey, 1)) return "Added to tomorrow's Context plan."
  return 'Added to Context for the calendar event date.'
}

export function calendarPlanExistingMessage(plannedFor: string, todayKey: string) {
  if (plannedFor === todayKey) return "This is already in today's Context plan."
  if (plannedFor === addDaysToKey(todayKey, 1)) return "This is already in tomorrow's Context plan."
  return 'This is already in Context for the calendar event date.'
}

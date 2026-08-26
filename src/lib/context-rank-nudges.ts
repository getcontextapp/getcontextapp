import type { ScoredCandidate } from '@/lib/context-rank'
import type { PlannedActivity } from '@/types'

export const CONTEXT_RANK_NUDGE_COOLDOWN_MS = 4 * 60 * 60 * 1000
export const CONTEXT_RANK_DAILY_LIMIT = 2

const LEGACY_SMS_FALLBACK_OUTCOMES = new Set([
  'context_rank_failed',
  'context_rank_abstained',
  'ranked_task_lookup_failed',
  'no_eligible_ranked_task',
])

export type RankedNudgeChoice = {
  candidate: ScoredCandidate
  task: PlannedActivity
  detail: string
}

export function rankedNudgeAllowsLegacySmsFallback(outcome: string, hasSms: boolean) {
  return hasSms && LEGACY_SMS_FALLBACK_OUTCOMES.has(outcome)
}

function plannedActivityIds(candidate: ScoredCandidate) {
  return candidate.episode.evidenceIds.flatMap(evidenceId => {
    const match = /^(?:task_planned|task_reopened):(.+)$/.exec(evidenceId)
    return match ? [match[1]] : []
  })
}

export function chooseRankedNudge(
  candidates: ScoredCandidate[],
  tasks: PlannedActivity[],
  profileId: string,
): RankedNudgeChoice | null {
  const tasksById = new Map(tasks.map(task => [task.id, task]))

  for (const candidate of candidates) {
    for (const taskId of plannedActivityIds(candidate)) {
      const task = tasksById.get(taskId)
      if (!task || task.status !== 'planned' || task.expected_time) continue
      if (task.assigned_to && task.assigned_to !== profileId) continue
      const detail = task.note?.trim() || task.label.trim()
      if (detail) return { candidate, task, detail }
    }
  }

  return null
}

export function rankedNudgeCopy(detail: string, detailedContent: boolean) {
  return {
    title: 'A gentle next step',
    pushBody: detailedContent
      ? `Would “${detail}” be a helpful next step?`
      : 'Context has one gentle next-step suggestion.',
    historyBody: `Would “${detail}” be a helpful next step?`,
  }
}

export function rankedNudgeReplyAction(body: string) {
  const normalized = body.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ')
  if (/^(done|finished|complete|completed|i did it|did it)$/.test(normalized)) return 'done' as const
  if (/^(yes|y|yep|yeah|sure|okay|ok|that works|sounds good)$/.test(normalized)) return 'accept' as const
  if (/^(no|n|nope|not now|later|maybe later|leave it|nevermind|never mind)$/.test(normalized)) return 'later' as const
  return null
}

export function rankedNudgeSafety(input: {
  sentToday: number
  latestNudgeAt?: string | null
  recentDueAt?: string | null
  nowMs: number
}) {
  if (input.sentToday >= CONTEXT_RANK_DAILY_LIMIT) return 'daily_limit' as const
  if (input.latestNudgeAt) {
    const elapsed = input.nowMs - Date.parse(input.latestNudgeAt)
    if (Number.isFinite(elapsed) && elapsed < CONTEXT_RANK_NUDGE_COOLDOWN_MS) return 'cooldown' as const
  }
  if (input.recentDueAt) return 'recent_due_reminder' as const
  return 'send' as const
}

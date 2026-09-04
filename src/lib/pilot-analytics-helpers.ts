export type AnalyticsQueryError = { code?: string; message: string }

export const ANALYTICS_PAGE_SIZE = 1000

export async function paginatedSelect<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: AnalyticsQueryError | null }>,
): Promise<{ data: T[] | null; error: AnalyticsQueryError | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    const result = await queryPage(from, from + ANALYTICS_PAGE_SIZE - 1)
    if (result.error) return { data: null, error: result.error }
    const page = (result.data ?? []) as T[]
    rows.push(...page)
    if (page.length < ANALYTICS_PAGE_SIZE) return { data: rows, error: null }
  }
}

export type SmsPromptRow = {
  id: string
  profile_id: string | null
  direction: 'inbound' | 'outbound'
  purpose: string
  created_at: string
}

export function matchPromptReplies(messages: SmsPromptRow[], promptPurposes: ReadonlySet<string>) {
  const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const prompts: SmsPromptRow[] = []
  const matchedPromptIds = new Set<string>()
  const latencies: number[] = []
  for (const message of ordered) {
    if (message.direction === 'outbound' && promptPurposes.has(message.purpose)) {
      prompts.push(message)
      continue
    }
    if (message.direction !== 'inbound') continue
    const replyAt = new Date(message.created_at).getTime()
    const prompt = [...prompts].reverse().find(candidate =>
      candidate.profile_id === message.profile_id &&
      !matchedPromptIds.has(candidate.id) &&
      replyAt > new Date(candidate.created_at).getTime() &&
      replyAt - new Date(candidate.created_at).getTime() <= 86_400_000
    )
    if (!prompt) continue
    matchedPromptIds.add(prompt.id)
    latencies.push(Math.round((replyAt - new Date(prompt.created_at).getTime()) / 60_000))
  }
  return { prompts: prompts.length, answered: matchedPromptIds.size, latencies, matchedPromptIds }
}

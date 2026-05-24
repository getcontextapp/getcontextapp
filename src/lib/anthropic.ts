import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-3-5-haiku-latest'

interface ReentryCardInput {
  displayName: string
  recentActivities: Array<{ label: string; category: string; note?: string | null; occurred_at: string }>
  triggerActivity: { label: string; category: string; note?: string | null }
  gapMinutes: number
}

interface GeneratedCard {
  title: string
  body: string
}

export async function generateReentryCard(input: ReentryCardInput): Promise<GeneratedCard> {
  const { displayName, recentActivities, triggerActivity, gapMinutes } = input

  const activityList = recentActivities
    .slice(0, 6)
    .map((a, i) => {
      const t = new Date(a.occurred_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      const detail = a.note?.trim() || a.label
      return `${i + 1}. ${detail} (${a.category}) at ${t}`
    })
    .join('\n')

  const hours = Math.round(gapMinutes / 60 * 10) / 10
  const gapText = hours >= 1 ? `about ${hours} hour${hours !== 1 ? 's' : ''}` : `about ${gapMinutes} minutes`

  const prompt = `You are writing a warm, gentle re-entry card for ${displayName}, an older adult returning to the Context app after being away for ${gapText}.

Their recent activities today:
${activityList}

The activity that just triggered this reminder: "${triggerActivity.label}"

Write a brief, grounding re-entry card to help orient them back to their day. The card should:
- Open with a gentle, friendly greeting (do not use "Hi" or "Hello" — be creative but warm)
- Mention 2–3 of the most recent activities in natural language, like recounting a story
- End with one short, encouraging sentence about continuing their day
- Avoid medical or clinical language
- Be written in second person ("you")
- Total length: 3–5 sentences

Respond ONLY with a JSON object with keys "title" (short, 4–6 words) and "body" (the card text). No markdown, no explanation.`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return { title: parsed.title ?? 'Welcome back', body: parsed.body ?? raw }
  } catch {
    return { title: 'Welcome back', body: raw }
  }
}

export async function generateOpenContextCard(
  displayName: string,
  recentActivities: Array<{ label: string; category: string; note?: string | null; occurred_at: string }>,
  timeZone?: string | null,
): Promise<GeneratedCard> {
  const now = new Date()
  const currentTime = now.toLocaleTimeString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const hour = Number(now.toLocaleString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    hour12: false,
  }))
  const dayPart =
    hour < 5 ? 'late night' :
    hour < 12 ? 'morning' :
    hour < 17 ? 'afternoon' :
    hour < 21 ? 'evening' :
    'night'

  const activityList = recentActivities
    .slice(0, 8)
    .map(a => {
      const t = new Date(a.occurred_at).toLocaleTimeString('en-US', {
        timeZone: timeZone || undefined,
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      const detail = a.note?.trim() || a.label
      return `• ${detail} (${a.category}) at ${t}`
    })
    .join('\n')

  const prompt = `You are writing a gentle orientation card for ${displayName}, an older adult with memory changes who is using Context to reconnect with their day.

Current local time: ${currentTime}
Current part of day: ${dayPart}

Their activities so far today:
${activityList}

The card appears at the top of their home screen. It should help them feel oriented and settled, not evaluated or pushed.

Write 2–3 short, warm sentences. The card should:
- Start with a natural orienting sentence that fits the current time of day
- Do not say "full day" unless it is late afternoon or evening and there are several activities
- Mention the activity details in plain, everyday language
- Prefer details like "Resting" or "Phone call"; do not say "spent time with Morning", "spent time with Meal", or treat category labels as people/things
- Avoid productivity language like "keep building your day", "stay on track", "progress", or "goals"
- Avoid clinical language and avoid sounding like a performance report
- End with a calm grounding sentence, such as "This is a good place to return to your day" or "You can take the next step from here"
- Use second person ("you")
- Keep the tone gentle, familiar, and reassuring

Respond ONLY with JSON: {"title": "4–6 word title", "body": "the summary text"}`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return { title: parsed.title ?? "Your day so far", body: parsed.body ?? raw }
  } catch {
    return { title: "Your day so far", body: raw }
  }
}

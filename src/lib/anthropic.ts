import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ReentryCardInput {
  displayName: string
  recentActivities: Array<{ label: string; category: string; occurred_at: string }>
  triggerActivity: { label: string; category: string }
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
      return `${i + 1}. ${a.label} (${a.category}) at ${t}`
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
    model: 'claude-opus-4-5',
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
  recentActivities: Array<{ label: string; category: string; occurred_at: string }>,
): Promise<GeneratedCard> {
  const activityList = recentActivities
    .slice(0, 8)
    .map(a => {
      const t = new Date(a.occurred_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      return `• ${a.label} at ${t}`
    })
    .join('\n')

  const prompt = `Write a brief, warm "open context" summary card for ${displayName} based on their activities so far today:

${activityList}

This card appears at the top of their home screen to help orient them. Write 2–3 gentle sentences describing their day so far in a narrative, friendly tone. No bullet points. End with an encouraging note.

Respond ONLY with JSON: {"title": "4–6 word title", "body": "the summary text"}`

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
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

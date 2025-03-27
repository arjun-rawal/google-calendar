import { z } from 'zod'
import { tool, streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { google } from 'googleapis'

export const generateAndAddCalendarEventTool = tool({
  description: `
    Generates ${'length'} subtopics for a given topic and creates Google Calendar events for each subtopic over ${'length'} days.
    Each event lasts "duration" (in minutes) and starts at "time" on each day.
  `,
  parameters: z.object({
    topic: z.string().describe('The main study topic'),
    length: z.number().describe('How many days (number of subtopics)'),
    duration: z.number().describe('Length of each event in minutes, e.g. 60'),
    time: z
      .string()
      .describe('Start time for each day, e.g. "07:00" or "14:00" (24-hour format)'),
  }),
  execute: async ({ topic, length, duration, time }) => {
    console.log('[generateAndAddCalendarEventTool] Start')

    const CLIENT_ID = process.env.CLIENT_ID || ''
    const CLIENT_SECRET = process.env.CLIENT_SECRET || ''
    const REDIRECT_URI = process.env.REDIRECT_URI || ''
    const OPENAI_KEY = process.env.OPENAI_API_KEY || ''

    if (!OPENAI_KEY) {
      throw new Error('Missing OPENAI_KEY in environment.')
    }

    const oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    )
    console.log("HERE1")
    if (!global.inMemoryTokens) {
      throw new Error('User not authenticated for Google Calendar')
    }
    oauth2Client.setCredentials(global.inMemoryTokens)

    console.log('[generateAndAddCalendarEventTool] Generating subtopics from OpenAI...')
    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: `Generate ${length} concise subtopics for "${topic}". Return each subtopic on its own line.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    })

    if (!openAiRes.ok) {
      const errText = await openAiRes.text()
      console.error('OpenAI Error:', errText)
      throw new Error('OpenAI API call failed')
    }

    const openAiJson = await openAiRes.json()
    const raw = openAiJson.choices?.[0]?.message?.content || ''
    const subtopics = raw
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)

 

    console.log('[generateAndAddCalendarEventTool] Creating Calendar events...')
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const [hours, mins] = time.split(':').map((part) => parseInt(part, 10))
    const now = new Date()
    const createdEvents = []

    for (let day = 1; day <= length; day++) {
      const eventDate = new Date(now)
      eventDate.setDate(now.getDate() + day)
      eventDate.setHours(hours)
      eventDate.setMinutes(mins)
      eventDate.setSeconds(0)

      const endDate = new Date(eventDate)
      endDate.setMinutes(endDate.getMinutes() + duration)

      const subtopic = subtopics[day - 1] || `Subtopic ${day}`

      const newEvent = {
        summary: `Day ${day} of ${topic}`,
        description: subtopic,
        start: { dateTime: eventDate.toISOString() },
        end: { dateTime: endDate.toISOString() },
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: newEvent,
      })

      createdEvents.push(response.data)
    }

    console.log('[generateAndAddCalendarEventTool] Done creating events.')

    return {
      status: 'success',
      message: `Created ${createdEvents.length} events for "${topic}"!`,
      subtopics,
      events: createdEvents,
    }
  },
})


export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    tools: {
      generateAndAddCalendarEvent: generateAndAddCalendarEventTool,
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}

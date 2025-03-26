//auth/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const CLIENT_ID = process.env.CLIENT_ID || '';
const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
const REDIRECT_URI = process.env.REDIRECT_URI || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';



global.inMemoryTokens = global.inMemoryTokens || {};

function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const action = url.searchParams.get('action')

  const oauth2Client = getOAuthClient()

  const getAuthUrl = () => {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/classroom.courses',
      'https://www.googleapis.com/auth/userinfo.email',
    ]
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
    })
  }

  if (!code && !action) {
    const authUrl = getAuthUrl()
    return NextResponse.redirect(authUrl)
  }

  if (code && !action) {
    try {
      const { tokens } = await oauth2Client.getToken(code)
      global.inMemoryTokens = tokens
      oauth2Client.setCredentials(tokens)

      return NextResponse.redirect(new URL('/chat', request.url))
    } catch (error: any) {
      console.error('Error exchanging code for tokens:', error)
      return new NextResponse(error.message || 'Token exchange failed', { status: 500 })
    }
  }

  if (action === 'listEvents') {
    try {
      oauth2Client.setCredentials(global.inMemoryTokens)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
      const now = new Date().toISOString()

      const eventsResponse = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now,
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
      })

      return NextResponse.json(eventsResponse.data.items || [])
    } catch (error: any) {
      console.error('Error listing events:', error)
      return new NextResponse(error.message || 'Failed to list events', { status: 401 })
    }
  }

  return new NextResponse('Unknown or unsupported action.', { status: 400 })
}


export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (action === 'generateAndAdd') {
    try {
      const { topic, days, time } = await request.json()
      const oauth2Client = getOAuthClient()
      oauth2Client.setCredentials(global.inMemoryTokens)

      if (!OPENAI_KEY) {
        throw new Error('Missing OPENAI_API_KEY in environment')
      }

      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Generate ${days} concise subtopics for "${topic}". Return each subtopic on its own line.`,
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

      if (subtopics.length < parseInt(days)) {
        console.warn('OpenAI returned fewer subtopics than requested. Using best guess.')
      }

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

      const [hours, minutes] = time.split(':').map((part: string) => Number(part))
      const totalDays = parseInt(days, 10)

      const now = new Date() 
      const createdEvents = []

      for (let i = 1; i <= totalDays; i++) {
        const eventDate = new Date(now)
        eventDate.setDate(now.getDate() + i)
        eventDate.setHours(hours)
        eventDate.setMinutes(minutes)
        eventDate.setSeconds(0)

        const endDate = new Date(eventDate)
        endDate.setHours(hours + 1)

        const subtopic = subtopics[i - 1] || `Subtopic ${i}`

        const newEvent = {
          summary: `Day ${i} of ${topic}`,
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

      return NextResponse.json({
        msg: `Created ${createdEvents.length} events for "${topic}"!`,
        events: createdEvents,
        subtopics,
      })
    } catch (error: any) {
      console.error('Error generating & adding events:', error)
      return new NextResponse(error.message || 'Event creation failed', { status: 500 })
    }
  }

  return new NextResponse('Method not allowed or unknown action.', { status: 405 })
}

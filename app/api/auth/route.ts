import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { readFile } from 'fs/promises'
import path from 'path'

const CLIENT_ID = process.env.CLIENT_ID || ''
const CLIENT_SECRET = process.env.CLIENT_SECRET || ''
const REDIRECT_URI = process.env.REDIRECT_URI || ''

global.inMemoryTokens = global.inMemoryTokens || {}

async function loadKeywords() {
  const filePath = path.join(process.cwd(), 'public', 'data', 'summaries.json')
  const fileContent = await readFile(filePath, 'utf-8')
  return JSON.parse(fileContent) 
}

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
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar',
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

  if (action === 'freeBusy') {
    try {
      oauth2Client.setCredentials(global.inMemoryTokens)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

      let timeMin = parseInt(url.searchParams.get('timeMin') as string, 10)
      let timeMax = parseInt(url.searchParams.get('timeMax') as string, 10)
      let length = parseInt(url.searchParams.get('length') as string, 10)

      if (isNaN(timeMin)) timeMin = 9
      if (isNaN(timeMax)) timeMax = 17
      if (!length || length < 1) length = 1

      const allDaysFreeSlots = []

      for (let i = 1; i <= length; i++) {
        const dayStart = new Date()
        dayStart.setDate(dayStart.getDate() + i)
        dayStart.setHours(timeMin, 0, 0, 0)

        const dayEnd = new Date()
        dayEnd.setDate(dayEnd.getDate() + i)
        dayEnd.setHours(timeMax, 0, 0, 0)

        const fbResponse = await calendar.freebusy.query({
          requestBody: {
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            items: [{ id: 'primary' }],
          },
        })

        const busyArray =
          fbResponse.data.calendars?.['primary']?.busy?.sort(
            (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
          ) || []

        const freeSlots = []
        let lastEnd = new Date(dayStart)

        for (const busySlot of busyArray) {
          const busyStart = new Date(busySlot.start)
          const busyEnd = new Date(busySlot.end)

          if (busyStart > lastEnd) {
            freeSlots.push({
              start: lastEnd.toISOString(),
              end: busyStart.toISOString(),
            })
          }
          if (busyEnd > lastEnd) {
            lastEnd = busyEnd
          }
        }

        if (lastEnd < dayEnd) {
          freeSlots.push({
            start: lastEnd.toISOString(),
            end: dayEnd.toISOString(),
          })
        }

        allDaysFreeSlots.push({
          date: dayStart.toISOString().split('T')[0],
          free: freeSlots,
        })
      }

      return NextResponse.json({
        free: allDaysFreeSlots,
      })
    } catch (error) {
      console.error('Error getting free/busy data:', error)
      return new NextResponse(error.message || 'Failed to get free/busy data', {
        status: 500,
      })
    }
  }

  return new NextResponse('Unknown or unsupported action.', { status: 400 })
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (action === 'addEvents') {
    try {
      const { events } = await request.json()

      const oauth2Client = getOAuthClient()
      oauth2Client.setCredentials(global.inMemoryTokens)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

      const keywords = await loadKeywords() 

      const createdEvents = []

      for (const evt of events) {
        const matchingSubtopic = keywords.find(
          (item) => item.name === evt.summary
        )

        if (matchingSubtopic) {
          const videoUrl = `https://www.revisiondojo.com/videos/${matchingSubtopic.id}`
          evt.description = evt.description
            ? `${evt.description}\nVideo Link: ${videoUrl}`
            : `Video Link: ${videoUrl}`
        }

        const response = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: evt,
        })
        createdEvents.push(response.data)
      }

      return NextResponse.json({
        msg: `Added ${createdEvents.length} events successfully!`,
        events: createdEvents,
      })
    } catch (error: any) {
      console.error('Error adding events:', error)
      return new NextResponse(error.message || 'Event creation failed', {
        status: 500,
      })
    }
  }

  return new NextResponse('Method not allowed or unknown action.', {
    status: 405,
  })
}

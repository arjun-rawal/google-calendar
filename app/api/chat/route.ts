import { z } from 'zod';
import { tool, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from 'googleapis';

export const addCalendarEventTool = tool({
  description:
    'Add a study plan event to Google Calendar for a given day. Accepts a single subtopic, duration, and scheduling details.',
  parameters: z.object({
    day: z.number().describe('Day number in the study plan'),
    topic: z.string().describe('The main study topic'),
    subtopic: z.string().describe('Subtopic for the day'),
    duration: z.number().describe('The study duration in minutes(e.g., 60)'),
    schedulingType: z
      .enum(['fixed', 'dynamic'])
      .describe(
        'Type of scheduling: "fixed" for the same time each day or "dynamic" based on existing events'
      ),
    time: z
      .string()
      .optional()
      .describe('If scheduling is fixed, the time of day (e.g., "07:00" or "14:00", please adjust pm or am to military time)'),
  }),
  execute: async ({ day, topic, subtopic, duration, schedulingType, time }) => {
    console.log("RUN TOOL")
    const CLIENT_ID = process.env.CLIENT_ID || '';
    const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
    const REDIRECT_URI = process.env.REDIRECT_URI || '';
    const oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );

    if (!global.inMemoryTokens) {
      throw new Error('User not authenticated for Google Calendar');
    }
    oauth2Client.setCredentials(global.inMemoryTokens);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const [hours, minutes] = time ? time.split(':').map(Number) : [9, 0];
    console.log(hours, minutes)
    const now = new Date();
    const eventDate = new Date(now);
    eventDate.setDate(now.getDate() + day);
    console.log(eventDate)
    eventDate.setHours(hours, minutes, 0, 0);
    const endDate = new Date(eventDate);
    endDate.setHours(eventDate.getMinutes() + duration);
    console.log("made it here2")

    console.log(day,topic,subtopic, eventDate, endDate, duration, schedulingType, time)
    const newEvent = {
      summary: `Day ${day} of ${topic}`,
      description: subtopic,
      start: { dateTime: eventDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
    };
    console.log("made it here3")

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: newEvent,
    });
    console.log("made it here4")

    console.log("DONE")
    console.log(response);

    return {
      result: {
        status: 'success',
        message: `Added event for day ${day} for ${topic} with subtopic "${subtopic}". Duration: ${duration}, Scheduling: ${schedulingType}${time ? ` at ${time}` : ''}.`,
      },
    };
  },
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    tools: {
      addCalendarEvent: addCalendarEventTool,
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}

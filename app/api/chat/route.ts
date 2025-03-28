import { z } from 'zod'
import { tool, streamText } from 'ai'
import { openai } from '@ai-sdk/openai'


export const createPlanTool = tool({
  description: `
  Gathers the necessary details for a study plan:
    - topic
    - planDuration (number of days)
    - lessonDuration (in minutes for each lesson)
    - timePreference (morning, afternoon, evening).
  Calls OpenAI to get {planDuration} subtopics for "topic".

  DO THIS BEFORE OTHER TOOLS
  `,
  parameters: z.object({
    topic: z.string().describe('Topic to plan for, "Linear Algebra"'),
    planDuration: z.number().describe('Number of days'),
    lessonDuration: z.number().describe('Duration of each lesson/event in minutes'),
    timePreference: z.enum(['morning', 'afternoon', 'evening'])
      .describe('Preferred time of day for lessons'),
  }),
  execute: async ({ topic, planDuration, lessonDuration, timePreference }) => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY in environment.')
    }

    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: `Generate ${planDuration} concise subtopics for "${topic}". Return each subtopic on its own line.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
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

    return {
      status: 'success',
      message: `Created a plan with ${planDuration} subtopics for "${topic}"`,
      subtopics,
      topic,
      planDuration,
      lessonDuration,
      timePreference,
    }
  },
})

export const schedulePlanTool = tool({
  description:"DO THIS AFTER THE USER IS GOOD WITH THE SUBTOPICS FROM createPlanTool"

  ,
  parameters: z.object({
    topic: z.string().describe('Topic to plan for, "Linear Algebra"'),
    planDuration: z.number().describe('Number of days'),
    lessonDuration: z.number().describe('Duration of each lesson/event in minutes'),
    timePreference: z.enum(['morning', 'afternoon', 'evening'])
      .describe('Preferred time of day for lessons'),
    subtopics: z.array(z.string())
  })
})
const eventSchema = z.object({
  summary: z.string(),
  description: z.string(),
  start: z.object({
    dateTime: z.string().datetime(),
  }),
  end: z.object({
    dateTime: z.string().datetime(),
  }),
});
export const confirmScheduleTool = tool({
  description:"DO THIS AFTER THE USER CONFIRMS THE SCHEDULED PLAN",
    parameters: z.object({
    topic: z.string().describe('Topic to plan for, "Linear Algebra"'),
    planDuration: z.number().describe('Number of days'),
    lessonDuration: z.number().describe('Duration of each lesson/event in minutes'),
    timePreference: z.enum(['morning', 'afternoon', 'evening'])
      .describe('Preferred time of day for lessons'),
    events: z.array(eventSchema)
  })
})



export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openai('gpt-4'),
    messages,
    tools: {
      createPlanTool,
      schedulePlanTool,
      confirmScheduleTool,
    },
    maxSteps: 10,
  })

  return result.toDataStreamResponse()
}

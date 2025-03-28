import { z } from 'zod'
import { tool, streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import path from 'path'
import { readFile } from 'fs/promises'
import natural from 'natural'
import similarity from 'compute-cosine-similarity'

async function loadKeywords() {
  const filePath = path.join(process.cwd(), 'public', 'data', 'summaries.json')
  const fileContent = await readFile(filePath, 'utf-8')
  return JSON.parse(fileContent) 
}

function computeRelevantSubtopics(
  topic: string,
  subtopics: Array<{ name: string; summary: string }>,
  days: number
) {
  const tokenizer = new natural.WordTokenizer()
  const topicTokens = tokenizer.tokenize(topic.toLowerCase())
  const subtopicTokens = subtopics.map((s) =>
    tokenizer.tokenize(`${s.name} ${s.summary}`.toLowerCase())
  )

  const allWords = new Set([...topicTokens, ...subtopicTokens.flat()])
  const wordsArray = Array.from(allWords)

  const tf = (tokens: string[]) =>
    wordsArray.map((word) => tokens.filter((t) => t === word).length)

  const topicVector = tf(topicTokens)
  const subtopicVectors = subtopicTokens.map(tf)

  const similarityScores = subtopicVectors.map((vec) =>
    similarity(topicVector, vec)
  )

  return subtopics
    .map((subtopic, index) => ({
      ...subtopic,
      similarityScore: similarityScores[index],
    }))
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, days)
}

export const createPlanTool = tool({
  description: `
  Gathers the necessary details for a study plan:
    - topic
    - planDuration (number of days)
    - lessonDuration (in minutes for each lesson)
    - timePreference (morning, afternoon, evening).
  Calls local JSON to get {planDuration} subtopics for "topic".
  `,
  parameters: z.object({
    topic: z.string().describe('Topic to plan for, "Linear Algebra"'),
    planDuration: z.number().describe('Number of days'),
    lessonDuration: z.number().describe('Duration of each lesson/event in minutes'),
    timePreference: z.enum(['morning', 'afternoon', 'evening'])
      .describe('Preferred time of day for lessons'),
  }),
  execute: async ({ topic, planDuration, lessonDuration, timePreference }) => {
   
    const keywords = await loadKeywords()
    const relevantSubtopics = computeRelevantSubtopics(topic, keywords, planDuration)
    const subtopics = relevantSubtopics.map((s) => s.name)

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
  description: "DO THIS AFTER THE USER IS GOOD WITH THE SUBTOPICS FROM createPlanTool",
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
})

export const confirmScheduleTool = tool({
  description: "DO THIS AFTER THE USER CONFIRMS THE SCHEDULED PLAN",
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

'use client';
import React, { useState, useEffect, FC } from 'react';
import { useChat } from '@ai-sdk/react';

interface ScheduledEvent {
  summary: string;
  description: string;
  start: { dateTime: string };
  end: { dateTime: string };
  durationMinutes?: number;
}

interface FreeBlockSlot {
  start: string;
  end: string;
}

interface FreeBlock {
  date: string;
  free: FreeBlockSlot[];
}

async function confirmScheduleTool(events: ScheduledEvent[]): Promise<string> {
  try {
    const res = await fetch('/api/auth?action=addEvents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (res.ok) {
      return 'added the events to your calendar.';
    } else {
      return 'unable to add the events. please try again.';
    }
  } catch {
    return 'try again.';
  }
}

function groupFreeByDate(freeArray: FreeBlock[]): Record<string, FreeBlockSlot[]> {
  const map: Record<string, FreeBlockSlot[]> = {};
  for (const dayInfo of freeArray) {
    const date = dayInfo.date;
    if (!map[date]) map[date] = [];
    map[date] = [...map[date], ...dayInfo.free];
  }
  for (const dateKey of Object.keys(map)) {
    map[dateKey].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }
  return map;
}

function findFreeSlot(
  dayFreeBlocks: FreeBlockSlot[],
  dayStart: Date,
  durationMs: number
): { startDate: Date; endDate: Date; index: number } | null {
  let pointerTime = new Date(dayStart);
  for (let i = 0; i < dayFreeBlocks.length; i++) {
    const freeStart = new Date(dayFreeBlocks[i].start);
    const freeEnd = new Date(dayFreeBlocks[i].end);
    if (pointerTime < freeStart) {
      pointerTime = freeStart;
    }
    if (pointerTime.getTime() + durationMs <= freeEnd.getTime()) {
      const startDate = new Date(pointerTime);
      const endDate = new Date(pointerTime.getTime() + durationMs);
      return { startDate, endDate, index: i };
    }
  }
  return null;
}

function placeEventsInFree(
  freeMap: Record<string, FreeBlockSlot[]>,
  events: ScheduledEvent[]
): ScheduledEvent[] {
  const placed: ScheduledEvent[] = [];
  const localFreeMap = JSON.parse(JSON.stringify(freeMap)) as Record<string, FreeBlockSlot[]>;
  for (const e of events) {
    const durationMs = (e.durationMinutes || 30) * 60000;
    const dayStart = new Date(e.start.dateTime);
    const dateKey = dayStart.toISOString().split('T')[0];
    if (!localFreeMap[dateKey]) continue;
    const slot = findFreeSlot(localFreeMap[dateKey], dayStart, durationMs);
    if (!slot) continue;
    e.start.dateTime = slot.startDate.toISOString();
    e.end.dateTime = slot.endDate.toISOString();
    placed.push(e);
    const oldBlock = localFreeMap[dateKey][slot.index];
    const oldStart = new Date(oldBlock.start);
    const oldEnd = new Date(oldBlock.end);
    const usedStart = slot.startDate;
    const usedEnd = slot.endDate;
    const newBlocks: FreeBlockSlot[] = [];
    if (oldStart < usedStart) {
      newBlocks.push({ start: oldStart.toISOString(), end: usedStart.toISOString() });
    }
    if (oldEnd > usedEnd) {
      newBlocks.push({ start: usedEnd.toISOString(), end: oldEnd.toISOString() });
    }
    localFreeMap[dateKey].splice(slot.index, 1, ...newBlocks);
  }
  return placed;
}

interface OnToolCallArgs {
  subtopics: string[];
  topic: string;
  planDuration: number;
  lessonDuration: number;
  timePreference: string;
}

const ChatPage: FC = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [freeBlocks, setFreeBlocks] = useState<FreeBlock[]>([]);
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEvent[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    async function checkLogin() {
      try {
        const res = await fetch('/api/auth?action=listEvents');
        setLoggedIn(res.status !== 401);
      } catch {
        setLoggedIn(false);
      }
      setLoading(false);
    }
    checkLogin();
  }, []);

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
    async onToolCall({ toolCall }) {
      const { toolName, args } = toolCall as { toolName: string; args: OnToolCallArgs };
      if (toolName === 'schedulePlanTool') {
        const { subtopics, topic, planDuration, lessonDuration, timePreference } = args;
        let targetHour = 8;
        if (timePreference === 'afternoon') targetHour = 12;
        if (timePreference === 'evening') targetHour = 17;
        try {
          const res = await fetch(
            `/api/auth?action=freeBusy&timeMin=${targetHour}&timeMax=${targetHour + 4}&length=${planDuration}`
          );
          if (!res.ok) {
            return `couldn't get your availability. try again?`;
          }
          const freeBusyData = await res.json();
          const freeArray: FreeBlock[] = freeBusyData.free || [];
          setFreeBlocks(freeArray);
          const now = new Date();
          const newEvents: ScheduledEvent[] = [];
          for (let i = 0; i < subtopics.length; i++) {
            const dayStart = new Date(now);
            dayStart.setDate(now.getDate() + (i + 1));
            dayStart.setHours(targetHour, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setMinutes(dayEnd.getMinutes() + lessonDuration);
            newEvents.push({
              summary: `Day ${i + 1} of ${topic}`,
              description: subtopics[i] || `Subtopic #${i + 1}`,
              start: { dateTime: dayStart.toISOString() },
              end: { dateTime: dayEnd.toISOString() },
              durationMinutes: lessonDuration
            });
          }
          const freeMap = groupFreeByDate(freeArray);
          const placedEvents = placeEventsInFree(freeMap, newEvents);
          setScheduledEvents(placedEvents);
          setShowCalendar(true);
          return { events: placedEvents };
        } catch {
          return 'try again';
        }
      }
    }
  });

  useEffect(() => {
    if (!loggedIn && !loading) {
      window.location.href = '/api/auth';
    }
  }, [loggedIn, loading]);

  if (loading) return <div>Loading...</div>;

  function handleRegenerate() {
    if (!freeBlocks?.length || !scheduledEvents.length) return;
    const freeMap = groupFreeByDate(freeBlocks);
    const reversed = [...scheduledEvents].reverse();
    const newPlacement = placeEventsInFree(freeMap, reversed);
    setScheduledEvents(newPlacement);
  }

  async function handleLooksGood() {
    await confirmScheduleTool(scheduledEvents);
  }

  function groupEventsByDate(events: ScheduledEvent[]) {
    const groups: Record<string, ScheduledEvent[]> = {};
    for (let e of events) {
      const start = new Date(e.start.dateTime);
      const dayKey = start.toISOString().split('T')[0];
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(e);
    }
    return groups;
  }

  function CalendarView({ events }: { events: ScheduledEvent[] }) {
    const grouped = groupEventsByDate(events);
    const dateKeys = Object.keys(grouped).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    for (const day of dateKeys) {
      grouped[day].sort(
        (a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime()
      );
    }
    return (
      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto' }}>
        {dateKeys.map((day) => {
          const dayEvents = grouped[day];
          const dayLabel = new Date(day).toDateString();
          return (
            <div key={day} style={{ minWidth: '200px', border: '1px solid #ccc', borderRadius: '4px', padding: '8px' }}>
              <h4>{dayLabel}</h4>
              {dayEvents.map((ev, idx) => {
                const startTime = new Date(ev.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const endTime = new Date(ev.end.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={idx} style={{ marginBottom: '8px', padding: '4px', background: '#f0f0f0', borderRadius: '4px' }}>
                    <strong>{ev.summary}</strong><br/>
                    {ev.description}<br/>
                    <small>{startTime} - {endTime}</small>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-xl p-4">
      <div>
        {messages.map((m, index) => (
          <div 
            key={index}
            className={`mb-2 p-2 rounded ${m.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}
          >
            <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong> {m.content}
          </div>
        ))}
      </div>
      {showCalendar && (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ccc' }}>
          <button onClick={handleLooksGood}>Looks Good</button>
          <h3>Your Free Blocks</h3>
          {!freeBlocks.length && <p>No free blocks found!</p>}
          {!!freeBlocks.length && (
            <ul>
              {freeBlocks.map((day, idx) => (
                <li key={idx}>
                  <strong>{day.date}</strong><br/>
                  {day.free.map((f, i) => (
                    <div key={i}>
                      Free from {f.start} to {f.end}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <hr style={{ margin: '1rem 0' }} />
          <h3>Scheduled Events</h3>
          {!scheduledEvents.length && <p>No events scheduled.</p>}
          {!!scheduledEvents.length && <CalendarView events={scheduledEvents} />}
          <div style={{ marginTop: '1rem' }}>
            <button onClick={handleRegenerate} style={{ marginRight: '1rem' }}>
              Regenerate
            </button>
          </div>
        </div>
      )}
      <form 
        onSubmit={handleSubmit}
        className="fixed bottom-0 left-0 right-0 max-w-xl mx-auto p-4 bg-white"
      >
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask me to create a learning plan..."
          className="w-full p-2 border rounded"
        />
      </form>
    </div>
  );
};

export default ChatPage;

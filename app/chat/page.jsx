'use client';

import React, { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkLogin() {
      try {
        const res = await fetch('/api/auth?action=listEvents');
        setLoggedIn(res.status !== 401);
      } catch (err) {
        setLoggedIn(false);
      }
      setLoading(false);
    }
    checkLogin();
  }, []);

  const { 
    messages, 
    input, 
    handleInputChange, 
    handleSubmit, 
    error 
  } = useChat({
    api: '/api/chat',
    
    async onToolCall({ toolCall }) {
      const { toolName, args } = toolCall;
      if (toolName === 'schedulePlanTool') {
        console.log("PLAN SCHED START")

        const { subtopics, topic, planDuration, lessonDuration, timePreference } = args;
        
        try {
          const freeBusyRes = await fetch('/api/auth?action=freeBusy');
          if (!freeBusyRes.ok) {
            return `I couldn't retrieve your availability. Could you please try again?`;
          }
          const freeBusyData = await freeBusyRes.json();

          let targetHour = 9; 
          if (timePreference === 'afternoon') targetHour = 14;
          if (timePreference === 'evening') targetHour = 19;

          const events = [];
          const now = new Date();
          for (let i = 0; i < subtopics.length; i++) {
            const dayStart = new Date(now);
            dayStart.setDate(now.getDate() + (i + 1));
            dayStart.setHours(targetHour);
            dayStart.setMinutes(0);
            dayStart.setSeconds(0);

            const dayEnd = new Date(dayStart);
            dayEnd.setMinutes(dayEnd.getMinutes() + lessonDuration);

            events.push({
              summary: `Day ${i + 1} of ${topic}`,
              description: subtopics[i] || `Subtopic #${i+1}`,
              start: { dateTime: dayStart.toISOString() },
              end: { dateTime: dayEnd.toISOString() },
            });
          }
          console.log("PLAN SCHED DONE", events)
          return { events };
        } catch (error) {
          console.error('Scheduling error:', error);
          return `Try again`;
        }
      }

      if (toolName === 'confirmScheduleTool') {
        const { events } = args;
        console.log("CONFIRMSCHEDSTART")
        console.log(events)
        try {
          const res = await fetch('/api/auth?action=addEvents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events }),
          });
          console.log("CONFIRMSCHEDEND")

          if (res.ok) {
            return 'added the events to your calendar.';
          } else {
            return 'unable to add the events to your calendar. Could you please try again?';
          }
        } catch (error) {
          console.error('Confirmation error:', error);
          return 'try again.';
        }
      }
    },
    
    onError: (err) => {
      console.error('Chat error:', err);
    }
  });

  useEffect(() => {
    if (!loggedIn && !loading) {
      window.location.href = '/api/auth';
    }
  }, [loggedIn, loading]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto max-w-xl p-4">
      

      <div>
        {messages.map((m, index) => (
          <div 
            key={index} 
            className={`mb-2 p-2 rounded ${
              m.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'
            }`}
          >
            <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong> 
            {m.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="fixed bottom-0 left-0 right-0 max-w-xl mx-auto p-4 bg-white">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask me to create a learning plan..."
          className="w-full p-2 border rounded"
        />
      </form>
    </div>
  );
}
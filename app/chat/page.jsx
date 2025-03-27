'use client';

import React, { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';

export default function ChatPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkLogin() {
      try {
        const res = await fetch('/api/auth?action=listEvents');
        if (res.status === 401) {
          setLoggedIn(false);
        } else {
          setLoggedIn(true);
        }
      } catch (err) {
        setLoggedIn(false);
      }
      setLoading(false);
    }
    checkLogin();
  }, []);

  const handleSignIn = () => {
    window.location.href = '/api/auth';
  };

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    initialMessages: [
      {
        role: 'system',
        content:    
          'Welcome!',
      },
    ],
  });

  if (loading) return <div>Loading...</div>;

  if (!loggedIn) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <button onClick={handleSignIn} style={{ padding: '1rem 2rem', fontSize: '1.2rem' }}>
          Sign In with Google
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
      <h2>Study Plan Chatbot</h2>
      <div style={{ border: '1px solid #ccc', padding: '1rem', minHeight: '300px' }}>
        {messages.map((msg) => (
          <div key={msg.content} style={{ marginBottom: '0.5rem' }}>
            <strong>{msg.role === 'user' ? 'User' : 'Bot'}:</strong>
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
        <input
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={handleInputChange}
          style={{ width: '80%', padding: '0.5rem' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Send
        </button>
      </form>
    </div>
  );
}

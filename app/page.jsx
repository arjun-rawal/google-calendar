'use client'

import React, { useState, useEffect } from 'react'

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [events, setEvents] = useState([])
  const [message, setMessage] = useState('')

  const [topic, setTopic] = useState('')
  const [days, setDays] = useState('1')
  const [time, setTime] = useState('09:00') 

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const res = await fetch('/api/auth?action=listEvents')
        if (res.status === 401) {
          setLoggedIn(false)
          return
        }
        setLoggedIn(true)
        const data = await res.json()
        setEvents(data)
      } catch (error) {
        console.error('Error checking login:', error)
        setLoggedIn(false)
      }
    }
    checkLogin()
  }, [])

  const handleSignIn = () => {
    window.location.href = '/api/auth'
  }

  const handleGenerateAndAdd = async (e) => {
    e.preventDefault()
    setMessage('')

    try {
      const res = await fetch('/api/auth?action=generateAndAdd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, days, time }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate and add events')
      }

      setMessage(data.msg)
      const eventsRes = await fetch('/api/auth?action=listEvents')
      if (eventsRes.ok) {
        const evData = await eventsRes.json()
        setEvents(evData)
      }

      setTopic('')
      setDays('1')
      setTime('09:00')
    } catch (error) {
      console.error('Error generating and adding events:', error)
      setMessage(error.message)
    }
  }

  const containerStyle = {
    maxWidth: 600,
    margin: 'auto',
    padding: '1rem',
    fontFamily: 'sans-serif',
    color: '#333',
  }

  const signInWrapperStyle = {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: 'sans-serif',
  }

  const signInButtonStyle = {
    fontSize: '1.2rem',
    padding: '1rem 2rem',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '8px',
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    transition: '0.2s all ease-in-out',
  }

  const cardStyle = {
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    padding: '1.5rem 2rem',
  }

  const labelStyle = {
    marginBottom: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    fontWeight: 500,
  }

  const inputStyle = {
    marginTop: '4px',
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
  }

  const buttonStyle = {
    padding: '0.7rem',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    background: '#4285f4',
    color: '#fff',
    fontWeight: 'bold',
  }

  const eventsCardStyle = {
    ...cardStyle,
    marginTop: '2rem',
  }

  if (!loggedIn) {
    return (
      <div style={signInWrapperStyle}>
        <button style={signInButtonStyle} onClick={handleSignIn}>
          Sign In with Google
        </button>
      </div>
    )
  }

  return (
    <div style={containerStyle}>

      <div style={cardStyle}>


        <form onSubmit={handleGenerateAndAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={labelStyle}>
            Topic
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Learn TypeScript"
              required
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Days
            <input
              type="number"
              min="1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              required
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Time
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              style={inputStyle}
            />
          </label>

          <button type="submit" style={buttonStyle}>
            Generate &amp; Add to Calendar
          </button>
        </form>
        {message && <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{message}</p>}
      </div>

      <div style={eventsCardStyle}>
        <h2>Your Upcoming Events</h2>
        {events.length === 0 && <p>No upcoming events found or not loaded yet.</p>}
        {events.length > 0 && (
          <ul style={{ marginTop: '1rem', paddingLeft: '1.5rem' }}>
            {events.map((event) => {
              const start = event.start?.dateTime || event.start?.date
              const end = event.end?.dateTime || event.end?.date
              return (
                <li key={event.id} style={{ marginBottom: '1rem' }}>
                  <strong>{event.summary || 'Untitled Event'}</strong>
                  <div style={{ fontSize: '0.9rem', color: '#555' }}>
                    <div>Start: {start}</div>
                    <div>End: {end}</div>
                    {event.description && <div>Description: {event.description}</div>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

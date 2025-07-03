import { useState, useEffect, useRef } from 'react'
import './App.css'
import { io } from 'socket.io-client'

const SOCKET_URL = 'http://localhost:5000' // adjust if backend is hosted elsewhere

function App() {
  const [mode, setMode] = useState('login') // 'login' or 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [user, setUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const socketRef = useRef(null)
  const chatEndRef = useRef(null)

  // Fetch messages and connect to socket after login
  useEffect(() => {
    if (user) {
      // Fetch message history
      fetch('/api/messages')
        .then(res => res.json())
        .then(data => setMessages(data))
        .catch(() => setMessages([]))
      // Connect to socket
      socketRef.current = io(SOCKET_URL)
      socketRef.current.on('chat message', (msg) => {
        setMessages(prev => [...prev, msg])
      })
      return () => {
        socketRef.current.disconnect()
      }
    }
  }, [user])

  // Scroll to bottom on new message
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
      } else {
        setSuccess(data.message)
        if (mode === 'login') setUser(data.user)
        setUsername('')
        setPassword('')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleSend = (e) => {
    e.preventDefault()
    if (!message.trim()) return
    if (socketRef.current) {
      socketRef.current.emit('chat message', {
        userId: user.id,
        content: message
      })
      setMessage('')
    }
  }

  if (user) {
    return (
      <div className="card" style={{ maxWidth: 500, margin: '2rem auto' }}>
        <h2>Welcome, {user.username}!</h2>
        <button style={{ float: 'right', marginBottom: 8, background: '#23272f', color: '#ff4d4f', border: '1px solid #ff4d4f' }} onClick={() => setUser(null)}>
          Logout
        </button>
        <div style={{
          background: '#23272f',
          borderRadius: 8,
          padding: 16,
          height: 300,
          overflowY: 'auto',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {messages.map((msg, idx) => (
            <div key={msg.id || idx} style={{ marginBottom: 8 }}>
              <span style={{ color: '#4f8cff', fontWeight: 'bold' }}>{msg.username}</span>
              <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{new Date(msg.created_at).toLocaleTimeString()}</span>
              <div style={{ color: '#f5f5f5' }}>{msg.content}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            style={{ flex: 1 }}
            autoFocus
          />
          <button type="submit" style={{ minWidth: 80 }}>Send</button>
        </form>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
        </button>
      </form>
      {error && <p style={{ color: '#ff4d4f' }}>{error}</p>}
      {success && <p style={{ color: '#4caf50' }}>{success}</p>}
      <p style={{ marginTop: 16 }}>
        {mode === 'login' ? (
          <>Don't have an account? <button onClick={() => { setMode('register'); setError(''); setSuccess(''); }} style={{ background: 'none', color: '#4f8cff', border: 'none', cursor: 'pointer' }}>Register</button></>
        ) : (
          <>Already have an account? <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} style={{ background: 'none', color: '#4f8cff', border: 'none', cursor: 'pointer' }}>Login</button></>
        )}
      </p>
    </div>
  )
}

export default App

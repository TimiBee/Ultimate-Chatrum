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
  const [token, setToken] = useState(null)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const socketRef = useRef(null)
  const chatEndRef = useRef(null)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [sendError, setSendError] = useState('')
  const [profile, setProfile] = useState({ avatar_url: '', status: '' })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [statusInput, setStatusInput] = useState('')
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const typingTimeoutRef = useRef(null)

  // Fetch user list after login
  useEffect(() => {
    if (user && token) {
      fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(setUsers)
        .catch(() => setUsers([]))
    }
  }, [user, token])

  // Fetch messages and connect to socket after login
  useEffect(() => {
    if (user && token) {
      setMessagesLoading(true)
      setMessagesError('')
      // Fetch public or private messages
      const url = selectedUser
        ? `/api/messages?recipientId=${selectedUser.id}`
        : '/api/messages'
      fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) throw new Error('Unauthorized')
          return res.json()
        })
        .then(data => setMessages(data))
        .catch(() => setMessagesError('Failed to load messages.'))
        .finally(() => setMessagesLoading(false))
      // Connect to socket with token
      socketRef.current = io(SOCKET_URL, {
        auth: { token }
      })
      // Join private room
      socketRef.current.emit('join', user.id)
      socketRef.current.on('chat message', (msg) => {
        if (!selectedUser && !msg.recipient_id) setMessages(prev => [...prev, msg])
      })
      socketRef.current.on('private message', (msg) => {
        if (selectedUser && (msg.user_id === selectedUser.id || msg.recipient_id === selectedUser.id)) {
          setMessages(prev => [...prev, msg])
        }
      })
      socketRef.current.on('connect_error', (err) => {
        setMessagesError('Socket authentication failed.')
      })
      return () => {
        socketRef.current.disconnect()
      }
    }
  }, [user, token, selectedUser])

  // Scroll to bottom on new message
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Fetch profile after login
  useEffect(() => {
    if (user && token) {
      setProfileLoading(true)
      fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          setProfile({ avatar_url: data.avatar_url, status: data.status })
          setStatusInput(data.status || '')
        })
        .catch(() => setProfileError('Failed to load profile.'))
        .finally(() => setProfileLoading(false))
    }
  }, [user, token])

  // Typing indicator handlers
  const handleTyping = () => {
    if (!socketRef.current || !user) return
    if (!isTyping) {
      socketRef.current.emit('typing', {
        userId: user.id,
        recipientId: selectedUser ? selectedUser.id : undefined
      })
      setIsTyping(true)
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.emit('stop typing', {
        userId: user.id,
        recipientId: selectedUser ? selectedUser.id : undefined
      })
      setIsTyping(false)
    }, 1200)
  }

  // Listen for typing events
  useEffect(() => {
    if (socketRef.current && user) {
      const handleTypingEvent = ({ userId }) => {
        if (userId === user.id) return
        setTypingUsers(prev => prev.includes(userId) ? prev : [...prev, userId])
      }
      const handleStopTypingEvent = ({ userId }) => {
        setTypingUsers(prev => prev.filter(id => id !== userId))
      }
      socketRef.current.on('typing', handleTypingEvent)
      socketRef.current.on('stop typing', handleStopTypingEvent)
      return () => {
        socketRef.current.off('typing', handleTypingEvent)
        socketRef.current.off('stop typing', handleStopTypingEvent)
      }
    }
  }, [user, selectedUser])

  // Emit 'message read' event for each message that is not sent by the current user and is not yet read, when it becomes visible.
  useEffect(() => {
    if (!user || !messages.length || !socketRef.current) return
    messages.forEach(msg => {
      if (msg.user_id !== user.id && !msg.is_read) {
        socketRef.current.emit('message read', { messageId: msg.id, userId: user.id })
      }
    })
  }, [messages, user])

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
        if (mode === 'login') {
          setUser(data.user)
          setToken(data.token)
        }
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
    setSendError('')
    if (!message.trim()) return
    if (socketRef.current) {
      try {
        socketRef.current.emit('chat message', {
          userId: user.id,
          content: message,
          recipientId: selectedUser ? selectedUser.id : undefined
        })
        setMessage('')
      } catch (err) {
        setSendError('Failed to send message.')
      }
    }
  }

  // Avatar upload handler
  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatarFile(file)
    const formData = new FormData()
    formData.append('avatar', file)
    setProfileLoading(true)
    setProfileError('')
    try {
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setProfile(p => ({ ...p, avatar_url: data.avatar_url }))
    } catch (err) {
      setProfileError('Failed to upload avatar.')
    } finally {
      setProfileLoading(false)
    }
  }

  // Status update handler
  const handleStatusUpdate = async (e) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileError('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: statusInput })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      setProfile(p => ({ ...p, status: statusInput }))
    } catch (err) {
      setProfileError('Failed to update status.')
    } finally {
      setProfileLoading(false)
    }
  }

  if (user) {
    return (
      <div className="card" style={{ maxWidth: 700, margin: '2rem auto', display: 'flex', gap: 24 }}>
        {/* User list for private chat */}
        <div style={{ minWidth: 180, borderRight: '1px solid #23272f', paddingRight: 16 }}>
          <h3 style={{ color: '#4f8cff' }}>Users</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              style={{ background: !selectedUser ? '#23272f' : 'none', color: !selectedUser ? '#fff' : '#4f8cff', border: 'none', borderRadius: 4, padding: 6, cursor: 'pointer' }}
              onClick={() => setSelectedUser(null)}
            >
              # Public Chat
            </button>
            {users.map(u => (
              <button
                key={u.id}
                style={{ background: selectedUser && selectedUser.id === u.id ? '#23272f' : 'none', color: selectedUser && selectedUser.id === u.id ? '#fff' : '#4f8cff', border: 'none', borderRadius: 4, padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => setSelectedUser(u)}
              >
                <img src={u.avatar_url || '/default-avatar.png'} alt="avatar" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                <span>{u.username}</span>
                {u.status && <span style={{ color: '#888', fontSize: 12 }}>({u.status})</span>}
              </button>
            ))}
          </div>
        </div>
        {/* Main chat area */}
        <div style={{ flex: 1 }}>
          <h2>{selectedUser ? `Chat with ${selectedUser.username}` : 'Public Chat'}</h2>
          <button style={{ float: 'right', marginBottom: 8, background: '#23272f', color: '#ff4d4f', border: '1px solid #ff4d4f' }} onClick={() => { setUser(null); setToken(null); }}>
            Logout
          </button>
          {/* Profile section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <img
              src={profile.avatar_url ? profile.avatar_url : '/default-avatar.png'}
              alt="avatar"
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #4f8cff' }}
            />
            <div>
              <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={profileLoading} />
              {profileLoading && <div style={{ color: '#888' }}>Uploading...</div>}
              {profileError && <div style={{ color: '#ff4d4f' }}>{profileError}</div>}
            </div>
          </div>
          <form onSubmit={handleStatusUpdate} style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Set a status..."
              value={statusInput}
              onChange={e => setStatusInput(e.target.value)}
              disabled={profileLoading}
              style={{ width: '70%' }}
            />
            <button type="submit" disabled={profileLoading || statusInput === profile.status} style={{ marginLeft: 8 }}>
              Update Status
            </button>
          </form>
          <div style={{ color: '#4f8cff', marginBottom: 8 }}>
            {profile.status && <span>Status: {profile.status}</span>}
          </div>
          {/* Chat UI */}
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
            {messagesLoading ? (
              <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Loading messages...</div>
            ) : messagesError ? (
              <div style={{ color: '#ff4d4f', textAlign: 'center', marginTop: 40 }}>{messagesError}</div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div key={msg.id || idx} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Avatar in chat */}
                    <img
                      src={msg.avatar_url || '/default-avatar.png'}
                      alt="avatar"
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid #4f8cff' }}
                    />
                    <div>
                      <span style={{ color: '#4f8cff', fontWeight: 'bold' }}>{msg.username}</span>
                      <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{new Date(msg.created_at).toLocaleTimeString()}</span>
                      <div style={{ color: '#f5f5f5' }}>{msg.content}</div>
                      {/* Read/unread indicator */}
                      {msg.user_id !== user.id && (
                        <span style={{ color: msg.is_read ? '#4caf50' : '#ff9800', fontSize: 12, marginLeft: 4 }}>
                          {msg.is_read ? 'Read' : 'Unread'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div style={{ color: '#4f8cff', fontStyle: 'italic', marginBottom: 8 }}>
                    {typingUsers.length === 1
                      ? `${users.find(u => u.id === typingUsers[0])?.username || 'Someone'} is typing...`
                      : 'Several people are typing...'}
                  </div>
                )}
              </>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Type a message..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              onInput={handleTyping}
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="submit" style={{ minWidth: 80 }}>Send</button>
          </form>
          {sendError && <div style={{ color: '#ff4d4f', marginTop: 8 }}>{sendError}</div>}
        </div>
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

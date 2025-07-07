// Basic Express + Socket.IO + MySQL server setup
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createPool } = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// MySQL connection
const pool = createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'chatapp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test DB connection
pool.getConnection((err, connection) => {
  if (err) {
    return console.error('Error connecting to MySQL:', err.stack);
  }
  console.log('Connected to MySQL');
  connection.release();
});

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided.' });
  jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token.' });
    req.user = user;
    next();
  });
}

// Socket.IO events
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('chat message', async (msg) => {
    // msg: { userId, content }
    if (!msg || !msg.userId || !msg.content) return;
    pool.query(
      'INSERT INTO messages (user_id, content) VALUES (?, ?)',
      [msg.userId, msg.content],
      (err, result) => {
        if (err) {
          console.error('Error saving message:', err);
          return;
        }
        // Fetch the saved message with user info
        pool.query(
          'SELECT messages.id, messages.content, messages.created_at, users.username FROM messages JOIN users ON messages.user_id = users.id WHERE messages.id = ?',
          [result.insertId],
          (err, rows) => {
            if (err) return;
            io.emit('chat message', rows[0]);
          }
        );
      }
    );
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// User registration endpoint
app.post('/api/register', async (req, res) => {
  const { username, password, avatar_url, status } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    // Check if user exists
    pool.query('SELECT id FROM users WHERE username = ?', [username], async (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      if (results.length > 0) return res.status(409).json({ error: 'Username already exists.' });
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      pool.query(
        'INSERT INTO users (username, password, avatar_url, status) VALUES (?, ?, ?, ?)',
        [username, hashedPassword, avatar_url || null, status || null],
        (err, result) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          res.status(201).json({ message: 'User registered successfully.' });
        }
      );
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// User login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  pool.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });
    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });
    // Generate JWT
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET || 'supersecretkey', { expiresIn: '1h' });
    res.json({ message: 'Login successful.', user: { id: user.id, username: user.username }, token });
  });
});

// Protect messages endpoint
app.get('/api/messages', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  pool.query(
    'SELECT messages.id, messages.content, messages.created_at, users.username FROM messages JOIN users ON messages.user_id = users.id ORDER BY messages.created_at DESC LIMIT ?',
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json(rows.reverse());
    }
  );
});

// Socket.IO JWT auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token provided.'));
  jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey', (err, user) => {
    if (err) return next(new Error('Invalid token.'));
    socket.user = user;
    next();
  });
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// Catch-all: send index.html for any route not handled
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 
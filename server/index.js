// Basic Express + Socket.IO + MySQL server setup
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createPool } = require('mysql2');
const bcrypt = require('bcrypt');
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
  const { username, password } = req.body;
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
      pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.status(201).json({ message: 'User registered successfully.' });
      });
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
    res.json({ message: 'Login successful.', user: { id: user.id, username: user.username } });
  });
});

// API endpoint to fetch recent messages
app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  pool.query(
    'SELECT messages.id, messages.content, messages.created_at, users.username FROM messages JOIN users ON messages.user_id = users.id ORDER BY messages.created_at DESC LIMIT ?',
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json(rows.reverse()); // reverse to get oldest first
    }
  );
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 
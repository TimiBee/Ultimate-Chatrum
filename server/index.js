// Basic Express + Socket.IO + MySQL server setup
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createPool } = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
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

  // Public or private message
  socket.on('chat message', async (msg) => {
    // msg: { userId, content, recipientId }
    if (!msg || !msg.userId || !msg.content) return;
    const isPrivate = !!msg.recipientId;
    pool.query(
      'INSERT INTO messages (user_id, content, recipient_id) VALUES (?, ?, ?)',
      [msg.userId, msg.content, msg.recipientId || null],
      (err, result) => {
        if (err) {
          console.error('Error saving message:', err);
          return;
        }
        // Fetch the saved message with user info
        pool.query(
          'SELECT messages.id, messages.content, messages.created_at, users.username, messages.recipient_id FROM messages JOIN users ON messages.user_id = users.id WHERE messages.id = ?',
          [result.insertId],
          (err, rows) => {
            if (err) return;
            const message = rows[0];
            if (isPrivate) {
              // Emit only to sender and recipient
              io.to(`user_${msg.userId}`).emit('private message', message);
              io.to(`user_${msg.recipientId}`).emit('private message', message);
            } else {
              io.emit('chat message', message);
            }
          }
        );
      }
    );
  });

  // Join user-specific room for private messages
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
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

// Fetch public or private messages
app.get('/api/messages', authenticateToken, (req, res) => {
  const { recipientId, limit } = req.query;
  const userId = req.user.id;
  const lim = parseInt(limit) || 50;
  let sql, params;
  if (recipientId) {
    // Private messages between user and recipient
    sql = `SELECT messages.id, messages.content, messages.created_at, users.username, messages.recipient_id FROM messages JOIN users ON messages.user_id = users.id WHERE (messages.user_id = ? AND messages.recipient_id = ?) OR (messages.user_id = ? AND messages.recipient_id = ?) ORDER BY messages.created_at DESC LIMIT ?`;
    params = [userId, recipientId, recipientId, userId, lim];
  } else {
    // Public messages
    sql = `SELECT messages.id, messages.content, messages.created_at, users.username, messages.recipient_id FROM messages JOIN users ON messages.user_id = users.id WHERE messages.recipient_id IS NULL ORDER BY messages.created_at DESC LIMIT ?`;
    params = [lim];
  }
  pool.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows.reverse());
  });
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

// Update user profile (avatar_url, status)
app.put('/api/profile', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { avatar_url, status } = req.body;
  if (!avatar_url && !status) {
    return res.status(400).json({ error: 'No fields to update.' });
  }
  // Build dynamic query
  const fields = [];
  const values = [];
  if (avatar_url !== undefined) {
    fields.push('avatar_url = ?');
    values.push(avatar_url);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    values.push(status);
  }
  values.push(userId);
  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  pool.query(sql, values, (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ message: 'Profile updated.' });
  });
});

// Get current user profile
app.get('/api/profile', authenticateToken, (req, res) => {
  pool.query('SELECT avatar_url, status FROM users WHERE id = ?', [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!results.length) return res.status(404).json({ error: 'User not found.' });
    res.json(results[0]);
  });
});

// Multer setup for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads/avatars'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, req.user.id + '_' + Date.now() + ext);
  }
});
const uploadAvatar = multer({ storage: avatarStorage });

// Ensure uploads/avatars directory exists
const avatarsDir = path.join(__dirname, 'uploads/avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// Avatar upload endpoint
app.post('/api/profile/avatar', authenticateToken, uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ message: 'Avatar updated.', avatar_url: avatarUrl });
  });
});

// Serve uploaded avatars statically
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads/avatars')));

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
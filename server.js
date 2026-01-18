// WFMS Server – Express + MySQL2/Promise + Connection Pool
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const QR = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const cors = require('cors');
const pool = require('./models/db');

const app = express();
const port = process.env.PORT || 8000;
const root = process.cwd();
const DATA_DIR = path.join(root, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure data dir and token file
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); } catch(e){}
try { if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, JSON.stringify({}), 'utf8'); } catch(e){}

// Initialize database schema
async function initializeDatabase() {
  try {
    const conn = await pool.getConnection();
    
    // Drop old tables to ensure fresh schema
    const dropStatements = [
      'DROP TABLE IF EXISTS time_logs',
      'DROP TABLE IF EXISTS attendance',
      'DROP TABLE IF EXISTS tasks',
      'DROP TABLE IF EXISTS users'
    ];
    
    for (const stmt of dropStatements) {
      try {
        await conn.query(stmt);
      } catch(e) {}
    }

    // Create fresh tables
    const schema = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(200) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'worker',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        assigned_to INT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_assigned_to (assigned_to),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at)
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        action VARCHAR(50),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_timestamp (timestamp),
        INDEX idx_user_timestamp (user_id, timestamp)
      );

      CREATE TABLE IF NOT EXISTS time_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        action VARCHAR(50),
        time DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_time (time),
        INDEX idx_created_at (created_at),
        INDEX idx_user_time (user_id, time)
      );
    `;

    // Split and execute each statement
    const statements = schema.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      await conn.query(stmt);
    }

    console.log('Database schema initialized');

    // Seed admin if missing
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@wfms.local';
    const adminPassword = process.env.SEED_ADMIN_PASS || 'admin';

    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
    if (existing.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await conn.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', 
        ['Admin', adminEmail, hash, 'admin']);
      
      const [adminResult] = await conn.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
      const adminId = adminResult[0].id;
      
      // Insert sample task (only title, description, assigned_to, status)
      await conn.query('INSERT INTO tasks (title, description, assigned_to, status) VALUES (?, ?, ?, ?)',
        ['Welcome Task', 'This is a seeded welcome task.', adminId, 'pending']);
      
      console.log('Seeded admin user and sample task');
    }

    conn.release();
  } catch (err) {
    console.error('Database initialization error:', err.message);
    throw err;
  }
}

// ------------------
// QR API routes (file-backed tokens)
// ------------------

app.post('/api/generate-qr', async (req, res) => {
  try {
    const { username, role } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    
    const token = uuidv4();
    const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8') || '{}');
    tokens[token] = { username, role, createdAt: new Date().toISOString() };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
    
    const qrData = await QR.toDataURL(token);
    res.json({ token, qrData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.post('/api/validate-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    
    const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8') || '{}');
    const info = tokens[token];
    if (!info) return res.status(404).json({ ok: false });
    
    res.json({ ok: true, user: info });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token validation failed' });
  }
});

// ------------------
// MySQL API routes (async/await + pool)
// ------------------

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!password) return res.status(400).json({ error: 'password required' });
    
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role || 'worker']
    );
    
    res.json({ ok: true, userId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query(
      'SELECT id, name, email, password, role FROM users WHERE email = ?',
      [email]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    delete user.password;
    res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, role FROM users');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Add task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, assigned_to } = req.body;
    const [result] = await pool.query(
      'INSERT INTO tasks (title, description, assigned_to, status) VALUES (?, ?, ?, ?)',
      [title, description, assigned_to, 'pending']
    );
    
    res.json({ ok: true, taskId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tasks');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update task status
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await pool.query('UPDATE tasks SET status = ? WHERE id = ?', [status, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Attendance: clock in, break start, break end, clock out
app.post('/api/attendance', async (req, res) => {
  try {
    const { user_id, action } = req.body;
    if (!user_id || !action) {
      return res.status(400).json({ error: 'user_id and action required' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO attendance (user_id, action) VALUES (?, ?)',
      [user_id, action]
    );
    
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get attendance for a user
app.get('/api/attendance/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE user_id = ? ORDER BY timestamp DESC',
      [user_id]
    );
    
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Time logs (legacy, maps to attendance)
app.post('/api/time', async (req, res) => {
  try {
    const { user_id, action, time } = req.body;
    const [result] = await pool.query(
      'INSERT INTO time_logs (user_id, action, time) VALUES (?, ?, ?)',
      [user_id, action, time || new Date()]
    );
    
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get time logs for a user
app.get('/api/time/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM time_logs WHERE user_id = ? ORDER BY time DESC',
      [user_id]
    );
    
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.use(express.static(root));
app.get('*', (req, res) => res.sendFile(path.join(root, 'index.html')));

// ------------------
// Start server after DB is ready
// ------------------

async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}/`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();




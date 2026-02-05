// ===============================================
// WFMS Server – Express + MySQL2/Promise + Firebase
// ===============================================
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const QR = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const cors = require('cors');

// Import database module (handles both MySQL and Firebase)
const dbModule = require('./db');
const { pool, firebase, useFirebase } = dbModule;

// Initialize Express app
const app = express();
const port = process.env.PORT || 8000;
const root = process.cwd();
const DATA_DIR = path.join(root, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Public config endpoint for client Firebase initialization ---
app.get('/config', (req, res) => {
  const cfg = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com` : ''),
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com` : ''),
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  };
  res.json(cfg);
});

// --- Firebase token verification middleware for protected routes ---
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const idToken = authHeader.split(' ')[1];
  try {
    if (!firebase || !firebase.auth) return res.status(500).json({ error: 'Firebase Admin not initialized' });
    const decoded = await firebase.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('✗ Token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Example protected route
app.get('/api/protected', verifyFirebaseToken, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Ensure data dir and token file exist
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); } catch(e){}
try { if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, JSON.stringify({}), 'utf8'); } catch(e){}

// ===============================================
// Database Initialization (MySQL Only)
// ===============================================

async function initializeDatabase() {
  if (useFirebase) {
    console.log('✓ Using Firebase - skipping MySQL schema initialization');
    return;
  }

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

    console.log('✓ Database schema initialized');

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
      
      // Insert sample task
      await conn.query('INSERT INTO tasks (title, description, assigned_to, status) VALUES (?, ?, ?, ?)',
        ['Welcome Task', 'This is a seeded welcome task.', adminId, 'pending']);
      
      console.log('✓ Seeded admin user and sample task');
    }

    conn.release();
  } catch (err) {
    console.error('✗ Database initialization error:', err.message);
    throw err;
  }
}

// ===============================================
// QR API Routes (File-backed Tokens)
// ===============================================

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

// ===============================================
// MySQL API Routes (for MySQL backend)
// ===============================================

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    if (useFirebase) {
      return res.status(400).json({ error: 'Use Firebase Authentication instead' });
    }

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
    if (useFirebase) {
      return res.status(400).json({ error: 'Use Firebase Authentication instead' });
    }

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

// --- Admin seeding endpoint (create admin user & assign custom claim) ---
// Use only in development or protect with SEED_ADMIN_SECRET in production
app.post('/admin/seed-admin', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    const provided = req.body.seedSecret || req.headers['x-seed-secret'];
    if (!process.env.SEED_ADMIN_SECRET || provided !== process.env.SEED_ADMIN_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  try {
    if (!firebase || !firebase.auth) return res.status(500).json({ error: 'Firebase Admin not initialized' });

    const email = req.body.email || process.env.SEED_ADMIN_EMAIL;
    const password = req.body.password || process.env.SEED_ADMIN_PASS;

    let userRecord = null;
    try { userRecord = await firebase.auth().getUserByEmail(email); } catch(e) { userRecord = null; }

    let uid;
    if (userRecord) {
      uid = userRecord.uid;
    } else {
      const created = await firebase.auth().createUser({ email, password });
      uid = created.uid;
    }

    await firebase.auth().setCustomUserClaims(uid, { role: 'admin' });
    res.json({ ok: true, uid });
  } catch (err) {
    console.error('✗ Seed admin failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    if (useFirebase) {
      const snapshot = await firebase.db.collection('users').get();
      const users = [];
      snapshot.forEach(doc => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return res.json(users);
    }

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

    if (useFirebase) {
      const docRef = await firebase.db.collection('tasks').add({
        title,
        description,
        assigned_to,
        status: 'pending',
        created_at: new Date()
      });
      return res.json({ ok: true, taskId: docRef.id });
    }

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
    if (useFirebase) {
      const snapshot = await firebase.db.collection('tasks').get();
      const tasks = [];
      snapshot.forEach(doc => {
        tasks.push({ id: doc.id, ...doc.data() });
      });
      return res.json(tasks);
    }

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

    if (useFirebase) {
      await firebase.db.collection('tasks').doc(id).update({ status });
      return res.json({ ok: true });
    }
    
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

    if (useFirebase) {
      const docRef = await firebase.db.collection('attendance').add({
        user_id,
        action,
        timestamp: new Date()
      });
      return res.json({ ok: true, id: docRef.id });
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

    if (useFirebase) {
      const snapshot = await firebase.db.collection('attendance')
        .where('user_id', '==', parseInt(user_id))
        .orderBy('timestamp', 'desc')
        .get();
      const records = [];
      snapshot.forEach(doc => {
        records.push({ id: doc.id, ...doc.data() });
      });
      return res.json(records);
    }
    
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

    if (useFirebase) {
      const docRef = await firebase.db.collection('time_logs').add({
        user_id,
        action,
        time: time ? new Date(time) : new Date(),
        created_at: new Date()
      });
      return res.json({ ok: true, id: docRef.id });
    }
    
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

    if (useFirebase) {
      const snapshot = await firebase.db.collection('time_logs')
        .where('user_id', '==', parseInt(user_id))
        .orderBy('time', 'desc')
        .get();
      const records = [];
      snapshot.forEach(doc => {
        records.push({ id: doc.id, ...doc.data() });
      });
      return res.json(records);
    }
    
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

// ===============================================
// Static Files & Fallback
// ===============================================

app.use(express.static(root));
app.get('*', (req, res) => res.sendFile(path.join(root, 'index.html')));

// ===============================================
// Start Server
// ===============================================

async function startServer() {
  try {
    // Initialize MySQL schema only if using MySQL
    if (!useFirebase) {
      await initializeDatabase();
    }
    
    app.listen(port, () => {
      console.log(`\n========================================`);
      console.log(`✓ Server running at http://localhost:${port}/`);
      console.log(`✓ Database: ${useFirebase ? 'Firebase' : 'MySQL'}`);
      console.log(`========================================\n`);
    });
  } catch (err) {
    console.error('✗ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();




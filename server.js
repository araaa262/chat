// server.js — Express app with SQLite auth, uploads, and socket.io
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname,'public')));

// --- database setup ---
const DB_PATH = path.join(__dirname, 'db', 'database.sqlite');
const dbdir = path.dirname(DB_PATH); if(!fs.existsSync(dbdir)) fs.mkdirSync(dbdir, { recursive: true });
const db = new Database(DB_PATH);

function migrate(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      text TEXT,
      img TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      img TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('migrations done');
}

if(process.argv.includes('--migrate')){ migrate(); process.exit(0); }

migrate();

// --- helpers ---
function createToken(user){
  return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
}

function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ error: 'Missing token' });
  const token = auth.replace('Bearer ', '');
  try{
    const payload = jwt.verify(token, SECRET);
    req.user = payload; next();
  } catch(e){ return res.status(401).json({ error: 'Invalid token' }); }
}

// --- auth routes ---
app.post('/api/register', async (req,res)=>{
  const { username, password, name } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const hashed = await bcrypt.hash(password, 10);
  try{
    const stmt = db.prepare('INSERT INTO users (username,password,name) VALUES (?,?,?)');
    const info = stmt.run(username, hashed, name || username);
    const user = { id: info.lastInsertRowid, username, name };
    const token = createToken(user);
    res.json({ user, token });
  } catch(e){
    return res.status(400).json({ error: 'User exists' });
  }
});

app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'Missing' });
  const row = db.prepare('SELECT id,username,password,name,avatar FROM users WHERE username = ?').get(username);
  if(!row) return res.status(400).json({ error: 'Invalid' });
  const ok = await bcrypt.compare(password, row.password);
  if(!ok) return res.status(400).json({ error: 'Invalid' });
  const user = { id: row.id, username: row.username, name: row.name, avatar: row.avatar };
  const token = createToken(user);
  res.json({ user, token });
});

// profile upload
app.post('/api/upload-profile', authMiddleware, upload.single('profile'), (req,res)=>{
  const file = req.file; if(!file) return res.status(400).json({ error: 'No file' });
  const url = '/uploads/' + path.basename(file.path);
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, req.user.id);
  res.json({ url });
});

// post status
app.post('/api/status', authMiddleware, upload.single('status'), (req,res)=>{
  const file = req.file; if(!file) return res.status(400).json({ error: 'No file' });
  const url = '/uploads/' + path.basename(file.path);
  db.prepare('INSERT INTO statuses (user_id,img) VALUES (?,?)').run(req.user.id, url);
  res.json({ url });
});

// messages REST
app.get('/api/messages', (req,res)=>{
  const rows = db.prepare('SELECT m.*, u.username, u.name, u.avatar FROM messages m LEFT JOIN users u ON u.id = m.user_id ORDER BY m.created_at ASC').all();
  res.json(rows);
});
app.post('/api/messages', authMiddleware, (req,res)=>{
  const { text } = req.body; const img = req.body.img || null;
  const info = db.prepare('INSERT INTO messages (user_id,text,img) VALUES (?,?,?)').run(req.user.id, text, img);
  const msg = db.prepare('SELECT m.*, u.username, u.name, u.avatar FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(info.lastInsertRowid);
  // emit via socket
  io.emit('message', msg);
  res.json(msg);
});

// statuses
app.get('/api/statuses', (req,res)=>{
  const rows = db.prepare('SELECT s.*, u.username, u.name, u.avatar FROM statuses s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC').all();
  res.json(rows);
});

// socket.io — simple real-time
io.on('connection', socket=>{
  console.log('socket connected', socket.id);
  // send recent messages
  const rows = db.prepare('SELECT m.*, u.username, u.name, u.avatar FROM messages m LEFT JOIN users u ON u.id = m.user_id ORDER BY m.created_at ASC').all();
  socket.emit('history', rows);

  socket.on('send', async (payload) => {
    // payload should be { token, text }
    try{
      const payloadUser = jwt.verify(payload.token, SECRET);
      const info = db.prepare('INSERT INTO messages (user_id,text) VALUES (?,?)').run(payloadUser.id, payload.text);
      const msg = db.prepare('SELECT m.*, u.username, u.name, u.avatar FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(info.lastInsertRowid);
      io.emit('message', msg);
    } catch(e){ socket.emit('error', 'auth failed'); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server running on', PORT));

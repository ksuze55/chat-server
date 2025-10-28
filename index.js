// server/index.js
import 'dotenv/config.js';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { ensureSchema, saveMessage, getRecentMessages } from './db.js';

const PORT = process.env.PORT || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: ORIGIN }));

app.get('/', (_, res) => res.send('Chat server is running'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN, methods: ['GET', 'POST'] }
});

// in-memory user map: socket.id -> { username, room }
const users = new Map();

// Ensure DB tables exist before accepting connections
await ensureSchema();

io.on('connection', (socket) => {
  socket.on('join', async ({ username, room, password = '' }) => {
    // (optional password check here if you added one)
    users.set(socket.id, { username, room });
    socket.join(room);

    // Send room history
    try {
      const history = await getRecentMessages(room, 50);
      socket.emit('history', history);
    } catch (e) {
      console.error('History fetch failed:', e.message);
    }

    socket.to(room).emit('system', `${username} joined ${room}`);
    io.to(room).emit('presence', getRoomPresence(room));
  });

  socket.on('typing', (isTyping) => {
    const info = users.get(socket.id);
    if (!info) return;
    socket.to(info.room).emit('typing', { username: info.username, isTyping });
  });

  socket.on('message', async (text) => {
    const info = users.get(socket.id);
    if (!info || !text?.trim()) return;

    const msg = {
      id: `${Date.now()}-${socket.id}`,
      username: info.username,
      room: info.room,
      text: text.trim(),
      ts: Date.now(),
    };

    // Persist to DB
    try {
      await saveMessage(msg);
    } catch (e) {
      console.error('Save failed:', e.message);
    }

    io.to(info.room).emit('message', msg);
  });

  socket.on('disconnect', () => {
    const info = users.get(socket.id);
    if (info) {
      users.delete(socket.id);
      socket.to(info.room).emit('system', `${info.username} left ${info.room}`);
      io.to(info.room).emit('presence', getRoomPresence(info.room));
    }
  });
});

function getRoomPresence(room) {
  const list = [];
  for (const [, v] of users.entries()) if (v.room === room) list.push(v.username);
  return list;
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


function getRoomPresence(room) {
  const list = [];
  for (const [, v] of users.entries()) if (v.room === room) list.push(v.username);
  return list;
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

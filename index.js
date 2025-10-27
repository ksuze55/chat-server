import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const PORT = process.env.PORT || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: ORIGIN }));

app.get("/", (_, res) => res.send("Chat server is running"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN, methods: ["GET", "POST"] }
});

// In-memory user map: socket.id -> { username, room }
const users = new Map();

io.on("connection", (socket) => {
  socket.on("join", ({ username, room }) => {
    users.set(socket.id, { username, room });
    socket.join(room);
    socket.to(room).emit("system", `${username} joined ${room}`);
    io.to(room).emit("presence", getRoomPresence(room));
  });

  socket.on("typing", (isTyping) => {
    const info = users.get(socket.id);
    if (!info) return;
    socket.to(info.room).emit("typing", { username: info.username, isTyping });
  });

  socket.on("message", (text) => {
    const info = users.get(socket.id);
    if (!info || !text?.trim()) return;
    const msg = {
      id: `${Date.now()}-${socket.id}`,
      username: info.username,
      room: info.room,
      text: text.trim(),
      ts: Date.now()
    };
    io.to(info.room).emit("message", msg);
  });

  socket.on("disconnect", () => {
    const info = users.get(socket.id);
    if (info) {
      users.delete(socket.id);
      socket.to(info.room).emit("system", `${info.username} left ${info.room}`);
      io.to(info.room).emit("presence", getRoomPresence(info.room));
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

// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// ----- In-memory room state -----
/*
room = {
  code: "ABC123",
  teacherId: socketId,
  participants: {
    [socketId]: { name, role: "teacher"|"student" }
  },
  currentQuestion: {
    id,
    text,
    options: [{ text, isCorrect }],
    duration,           // seconds
    startedAt,          // Date.now()
    responses: { [socketId]: { optionIndex } }
  },
  history: [ { ...same as currentQuestion, results: [counts] } ]
}
*/
const rooms = {};

function getOrCreateRoom(code) {
  if (!rooms[code]) {
    rooms[code] = {
      code,
      teacherId: null,
      participants: {},
      currentQuestion: null,
      history: [],
    };
  }
  return rooms[code];
}

function getRoomBySocket(socketId) {
  return Object.values(rooms).find((r) => r.participants[socketId]);
}

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  // Join as teacher or student
  socket.on("joinRoom", ({ roomCode, role, name }) => {
    roomCode = roomCode.trim().toUpperCase() || "DEFAULT";
    const room = getOrCreateRoom(roomCode);

    // ensure single teacher
    if (role === "teacher") {
      if (room.teacherId && room.teacherId !== socket.id) {
        socket.emit("joinError", "Teacher already connected for this room.");
        return;
      }
      room.teacherId = socket.id;
    }

    room.participants[socket.id] = { name, role };
    socket.join(roomCode);

    // send initial state
    socket.emit("joined", {
      roomCode,
      role,
      name,
      history: room.history,
      currentQuestion: room.currentQuestion,
    });

    // update others (participants list)
    io.to(roomCode).emit("participantsUpdate", {
      participants: room.participants,
      teacherId: room.teacherId,
    });

    console.log(`${name} joined ${roomCode} as ${role}`);
  });

  // Teacher creates a question
  socket.on("createQuestion", (payload) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.teacherId !== socket.id) return;

    const { text, options, duration } = payload;
    const question = {
      id: Date.now(),
      text,
      options, // [{ text, isCorrect }]
      duration,
      startedAt: Date.now(),
      responses: {},
    };

    room.currentQuestion = question;

    io.to(room.code).emit("newQuestion", question);
  });

  // Student submits answer
  socket.on("submitAnswer", ({ optionIndex }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.currentQuestion) return;

    const q = room.currentQuestion;
    // store/overwrite
    q.responses[socket.id] = { optionIndex };

    // calculate aggregate results
    const counts = new Array(q.options.length).fill(0);
    Object.values(q.responses).forEach((r) => {
      if (
        typeof r.optionIndex === "number" &&
        r.optionIndex >= 0 &&
        r.optionIndex < counts.length
      ) {
        counts[r.optionIndex]++;
      }
    });

    io.to(room.code).emit("resultsUpdate", { counts });
  });

  // Teacher ends question and moves to history
  socket.on("endQuestion", () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.teacherId !== socket.id || !room.currentQuestion) return;

    const q = room.currentQuestion;

    const counts = new Array(q.options.length).fill(0);
    Object.values(q.responses).forEach((r) => {
      if (
        typeof r.optionIndex === "number" &&
        r.optionIndex >= 0 &&
        r.optionIndex < counts.length
      ) {
        counts[r.optionIndex]++;
      }
    });

    room.history.unshift({
      ...q,
      results: counts,
    });

    room.currentQuestion = null;

    io.to(room.code).emit("questionEnded", {
      history: room.history,
    });
  });

  // Chat message
  socket.on("chatMessage", ({ text }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const user = room.participants[socket.id];
    if (!user) return;

    io.to(room.code).emit("chatMessage", {
      from: user.name,
      role: user.role,
      text,
      at: Date.now(),
    });
  });

  // Teacher kicks a user
  socket.on("kickUser", ({ targetId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.teacherId !== socket.id) return;
    if (!room.participants[targetId]) return;

    io.to(targetId).emit("kicked");
    io.sockets.sockets.get(targetId)?.leave(room.code);
    delete room.participants[targetId];

    io.to(room.code).emit("participantsUpdate", {
      participants: room.participants,
      teacherId: room.teacherId,
    });
  });

  socket.on("disconnect", () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const user = room.participants[socket.id];
    if (!user) return;

    delete room.participants[socket.id];

    if (room.teacherId === socket.id) {
      room.teacherId = null;
      room.currentQuestion = null;
      io.to(room.code).emit("teacherLeft");
    }

    io.to(room.code).emit("participantsUpdate", {
      participants: room.participants,
      teacherId: room.teacherId,
    });

    console.log("socket disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});

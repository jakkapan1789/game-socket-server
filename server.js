const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

let users = {};
let currentQuestion = null;

app.get("/", (req, res) => {
  res.send("Socket.IO server with user login is running!");
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.on("login", (username) => {
    users[socket.id] = username;
    console.log(`${username} has logged in.`);
    io.emit("updateUsers", Object.values(users));
  });

  socket.on("message", (message) => {
    const username = users[socket.id] || "Anonymous";
    console.log(`${username}: ${message}`);
    io.emit("message", { username, message });
  });

  socket.on("disconnect", () => {
    const username = users[socket.id];
    delete users[socket.id];
    console.log(`${username} disconnected.`);
    io.emit("updateUsers", Object.values(users));
  });

  socket.on("startGame", (question) => {
    currentQuestion = question;
    io.emit("gameStarted", question);
  });

  socket.on("submitAnswer", (data) => {
    console.log(`${data.username} answered: ${data.answer}`);
    io.emit("answerReceived", data);
  });
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

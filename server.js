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

  socket.on("gameActive", (gameNo) => {
    io.emit("gameActive", gameNo);
  });

  socket.on("startGameMemory", () => {
    const EMOJIS = [
      "/images/rubber-duck.png",
      "/images/smiling.png",
      "/images/golf-club.png",
      "/images/dolphin.png",
      "/images/Tea-Rex.png",
      "/images/koala.png",
      "/images/cat.png",
      "/images/dog.png",
    ];
    const duplicatedEmojis = [...EMOJIS, ...EMOJIS];
    const shuffledEmojis = duplicatedEmojis.sort(() => Math.random() - 0.5);
    gameState = {
      cards: shuffledEmojis.map((emoji, index) => ({
        id: index,
        emoji,
        isFlipped: false,
        isMatched: false,
      })),
      moves: 0,
      winner: null,
    };
    io.emit("gameStartedMemory", gameState);
  });
  socket.on("gameCompleteMemory", (winner) => {
    if (winner) {
      io.emit("gameCompletedMemory", { winner }); // Broadcast the winner
      console.log(`${winner} completed the memory game!`);
    }
  });
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

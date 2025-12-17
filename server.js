const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let users = {};
let currentGame = 0; // 0 = Question, 1 = Memory, 2 = Bingo, 3 = Logo Quiz

// 🧩 Bingo State
let bingoBoards = {};
let drawnNumbers = [];
let gameActive = false;
let bingoGameId = null;

// 🟧 Logo Quiz State
const LOGO_DATA = [
  {
    brand: "Apple",
    real: "/logos/apple_real.png",
    fake: "/logos/apple_fake.png",
  },
  {
    brand: "Starbuck",
    real: "/logos/sb_real.png",
    fake: "/logos/sb_fake.png",
  },
  {
    brand: "7-Elevent",
    real: "/logos/7-11-real.png",
    fake: "/logos/7-11-fake.png",
  },
  {
    brand: "Fabrinet",
    real: "/logos/fbn-real.png",
    fake: "/logos/fbn-fake.png",
  },
  {
    brand: "Honda",
    real: "/logos/honda-real.png",
    fake: "/logos/honda-fake.png",
  },
  {
    brand: "Mitsubishi",
    real: "/logos/msbs-real.png",
    fake: "/logos/msbs-fake.png",
  },

  {
    brand: "Pepsi",
    real: "/logos/pepsi-real.png",
    fake: "/logos/pepsi-fake.png",
  },
  {
    brand: "Tesla",
    real: "/logos/tesla-real.png",
    fake: "/logos/tesla-fake.png",
  },
  {
    brand: "Toyota",
    real: "/logos/toyota-real.png",
    fake: "/logos/toyota-fake.png",
  },
  {
    brand: "Lion",
    real: "/logos/lion-real.png",
    fake: "/logos/lion-fake.jpeg",
  },
  {
    brand: "Zebra",
    real: "/logos/zebra-real.png",
    fake: "/logos/zebra-fake.png",
  },
  {
    brand: "Cat",
    real: "/logos/cat-like.png",
    fake: "/logos/lion-like.png",
  },
  {
    brand: "Raccoon",
    real: "/logos/raccoon-mafia.png",
    fake: "/logos/cat-mafia.png",
  },
  {
    brand: "Panda",
    real: "/logos/cute-panda.png",
    fake: "/logos/cat-panda.png",
  },
  {
    brand: "Strong Cat",
    real: "/logos/strong-cat.png",
    fake: "/logos/strong-panda.png",
  },
  {
    brand: "Microsoft",
    real: "/logos/microsoft-real.png",
    fake: "/logos/microsoft-fake.png",
  },
  {
    brand: "Dog",
    real: "/logos/dog-real.png",
    fake: "/logos/dog-fake.png",
  },
];

let logoScores = {};
let currentLogoRound = null;
const LOGO_DURATION_MS = 10000;

// Helper: Unique random numbers per board
const generateUniqueBingoBoard = (username, size = 5) => {
  const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
  const shuffled = allNumbers.sort(() => Math.random() - 0.5);
  const boardNumbers = shuffled.slice(0, size * size);
  return boardNumbers;
};

// Helper: Leaderboard Top 3
function getLogoLeaderboard(limit = 10) {
  return Object.entries(logoScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([username, score]) => ({ username, score }));
}

app.get("/", (req, res) => res.send("🎯 FITS Game Socket Server Running"));

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // ───────────────────────────────
  // 🧩 Login Event
  // ───────────────────────────────
  socket.on("login", (username) => {
    users[socket.id] = username;
    console.log(`${username} joined`);
    io.emit("updateUsers", Object.values(users));

    // ส่งสถานะเกมปัจจุบันกลับให้ผู้เล่นใหม่
    socket.emit("currentGame", currentGame);

    // ✅ ถ้าเกม Bingo ยังไม่จบ ให้ sync กลับไป
    if (currentGame === 2 && gameActive && bingoBoards[username]) {
      socket.emit("gameStartedBingo", {
        game_id: bingoGameId,
        board: bingoBoards[username],
        drawnNumbers,
      });
    }

    // ✅ ถ้าอยู่ใน Logo Quiz และมีรอบค้าง ให้ sync ไปด้วย
    if (currentGame === 3 && currentLogoRound) {
      const { brand, choices, roundId, expiresAt, correctType } =
        currentLogoRound;
      socket.emit("logoRoundStarted", {
        brand,
        choices,
        roundId,
        expiresAt,
        durationMs: LOGO_DURATION_MS,
        correctType,
      });

      // คะแนนของ user นี้เอง
      if (logoScores[username]) {
        socket.emit("scoreUpdatedLogo", {
          username,
          score: logoScores[username],
          points: 0,
        });
      }

      // leaderboard ปัจจุบัน
      socket.emit("logoLeaderboard", getLogoLeaderboard());
    }
  });

  // ───────────────────────────────
  // 🟢 เปลี่ยนเกม (Admin ใช้)
  // ───────────────────────────────
  socket.on("gameActive", (gameNo) => {
    currentGame = gameNo;
    io.emit("gameActive", gameNo);
    console.log("📦 Active Game:", gameNo);
  });

  // ─────────────────────────────
  // 🟩 Question Game
  // ─────────────────────────────
  socket.on("newQuestion", (question) => {
    currentQuestion = question;
    currentGame = 0;
    io.emit("gameActive", 0);
    io.emit("gameStarted", question);
  });

  socket.on("submitAnswer", (data) => {
    console.log(`${data.username} answered: ${data.answer}`);
    io.emit("answerReceived", data);
  });

  // ─────────────────────────────
  // 🟦 Memory Game
  // ─────────────────────────────
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
    const shuffled = duplicatedEmojis.sort(() => Math.random() - 0.5);

    gameState = {
      cards: shuffled.map((emoji, i) => ({
        id: i,
        emoji,
        isFlipped: false,
        isMatched: false,
      })),
      moves: 0,
      winner: null,
    };
    currentGame = 1;
    io.emit("gameActive", 1);
    io.emit("gameStartedMemory", gameState);
  });

  socket.on("gameCompleteMemory", (winner) => {
    if (winner) {
      io.emit("gameCompletedMemory", { winner });
      console.log(`🏁 ${winner} completed the memory game!`);
    }
  });

  // ───────────────────────────────
  // 🟥 Bingo Game
  // ───────────────────────────────
  socket.on("startGameBingo", () => {
    console.log("🎮 Admin started Bingo Game!");
    currentGame = 2;
    gameActive = true;
    drawnNumbers = [];
    bingoGameId = generateShortNumericId();
    bingoBoards = {};

    for (const id in users) {
      const username = users[id];
      const board = generateUniqueBingoBoard(username);
      bingoBoards[username] = board;

      io.to(id).emit("gameStartedBingo", {
        game_id: bingoGameId,
        board,
        drawnNumbers: [],
      });
    }

    io.emit("gameActive", 2);
  });

  socket.on("syncBingoState", ({ username }) => {
    // ไม่มีเกมกำลังเล่น
    if (!gameActive || currentGame !== 2) {
      socket.emit("bingoSyncResult", { status: "NO_GAME" });
      return;
    }

    // เกมกำลังเล่น แต่ user ไม่มี board → เข้าไม่ทัน
    if (!bingoBoards[username]) {
      socket.emit("bingoSyncResult", {
        status: "GAME_IN_PROGRESS",
        reason: "NO_BOARD",
      });
      return;
    }

    // เกมกำลังเล่น และ user อยู่ใน room เดิม
    socket.emit("bingoSyncResult", {
      status: "SYNC",
      game_id: bingoGameId,
      board: bingoBoards[username],
      drawnNumbers,
    });
  });

  socket.on("requestNewBingoBoard", ({ username }) => {
    // ถ้ามีเลขออกแล้ว → ห้ามเปลี่ยน
    if (drawnNumbers.length > 0) {
      io.to(socket.id).emit("bingoBoardDenied");
      return;
    }

    // สร้าง board ใหม่
    const newBoard = generateUniqueBingoBoard(username);
    bingoBoards[username] = newBoard;

    console.log(`🔄 ${username} refreshed their board.`);

    io.to(socket.id).emit("bingoBoardUpdated", { board: newBoard });
  });

  function generateShortNumericId() {
    return Math.floor(100 + Math.random() * 900); // 100–999
  }

  socket.on("drawBingoNumber", () => {
    if (!gameActive) return;
    let number;
    do {
      number = Math.floor(Math.random() * 75) + 1;
    } while (drawnNumbers.includes(number));

    drawnNumbers.push(number);
    console.log("🎲 Draw:", number);

    io.emit("bingoNumber", {
      game_id: bingoGameId,
      number,
      drawnNumbers,
    });
  });

  socket.on("bingoComplete", (obj) => {
    if (!gameActive) return;

    console.log(`🏆 ${obj.username} called BINGO!`);
    io.emit("bingoWinner", { winner: obj.username, game_id: obj.game_id });
    gameActive = false;
  });

  // ───────────────────────────────
  // 🟧 Logo Quiz Game
  // ───────────────────────────────

  // Admin เลือกโลโก้ + เริ่มรอบใหม่
  socket.on("startLogoRoundAdmin", ({ brand, correctType }) => {
    const logo = LOGO_DATA.find((l) => l.brand === brand);
    if (!logo) {
      console.warn("Logo brand not found:", brand);
      return;
    }

    const now = Date.now();
    const roundId = now;
    const expiresAt = now + LOGO_DURATION_MS;

    const choices = [
      { image: logo.real, isReal: true },
      { image: logo.fake, isReal: false },
    ].sort(() => Math.random() - 0.5);

    currentLogoRound = {
      brand: logo.brand,
      roundId,
      startedAt: now,
      expiresAt,
      choices,
      answeredUsers: [], // กัน spam ตอบซ้ำ
      correctType: correctType || "real", // 💡 default เป็น "real" ถ้าไม่ส่งมา
    };

    currentGame = 3;
    io.emit("gameActive", 3);

    io.emit("logoRoundStarted", {
      brand: logo.brand,
      roundId,
      choices,
      expiresAt,
      durationMs: LOGO_DURATION_MS,
      correctType: correctType || "real",
    });

    io.emit("logoLeaderboard", getLogoLeaderboard());

    console.log(
      `🟧 Logo Quiz started: ${logo.brand}, roundId=${roundId}, expiresAt=${expiresAt}, correctType=${correctType}`
    );
  });

  // ผู้เล่นตอบ: { username, roundId, choiceIndex }
  // socket.on("answerLogo", ({ username, roundId, choiceIndex }) => {
  //   if (!currentLogoRound) return;
  //   if (roundId !== currentLogoRound.roundId) return;

  //   const now = Date.now();
  //   if (now > currentLogoRound.expiresAt) {
  //     console.log(`⏰ Answer too late from ${username}`);
  //     return;
  //   }

  //   const { choices, startedAt, answeredUsers, correctType } = currentLogoRound;
  //   const choice = choices[choiceIndex];
  //   if (!choice) return;

  //   // ห้ามตอบซ้ำ
  //   if (answeredUsers.includes(username)) return;

  //   // ✅ ตัดสินถูก/ผิดตามโหมดที่ Admin เลือก
  //   const isCorrect =
  //     (correctType === "real" && choice.isReal) ||
  //     (correctType === "fake" && !choice.isReal);

  //   if (!isCorrect) {
  //     console.log(
  //       `❌ ${username} answered wrong in Logo Quiz (mode=${correctType})`
  //     );
  //     answeredUsers.push(username); // นับว่าใช้สิทธิ์ตอบแล้ว
  //     return;
  //   }

  //   const elapsedSec = (now - startedAt) / 1000;

  //   let points = 1;
  //   if (elapsedSec <= 2) {
  //     points = 3; // 8–10 วินาทีแรก
  //   } else if (elapsedSec <= 4) {
  //     points = 2; // 6–7 วิ
  //   } else {
  //     points = 1; // น้อยกว่านั้น แต่ยังไม่หมดเวลา
  //   }

  //   if (!logoScores[username]) logoScores[username] = 0;
  //   logoScores[username] += points;
  //   answeredUsers.push(username);

  //   console.log(
  //     `✅ ${username} correct in Logo Quiz (+${points}) total=${logoScores[username]}`
  //   );

  //   io.emit("scoreUpdatedLogo", {
  //     username,
  //     score: logoScores[username],
  //     points,
  //   });
  //   io.emit("logoLeaderboard", getLogoLeaderboard());
  // });
  socket.on("answerLogo", ({ username, roundId, choiceIndex }) => {
    if (!currentLogoRound) return;
    if (roundId !== currentLogoRound.roundId) return;

    const now = Date.now();
    if (now > currentLogoRound.expiresAt) return;

    const { choices, startedAt, answeredUsers, correctType } = currentLogoRound;
    const choice = choices[choiceIndex];
    if (!choice) return;

    if (answeredUsers.includes(username)) return;

    const isCorrect =
      (correctType === "real" && choice.isReal) ||
      (correctType === "fake" && !choice.isReal);

    // ❌ ตอบผิด — หักคะแนน -1
    // ❌ ตอบผิด — หักคะแนน -1 (แต่ไม่ต่ำกว่า 0)
    if (!isCorrect) {
      console.log(`❌ ${username} answered wrong in Logo Quiz`);

      if (!logoScores[username]) logoScores[username] = 0;

      logoScores[username] = Math.max(logoScores[username] - 1, 0); // ⭐ ไม่ต่ำกว่า 0

      answeredUsers.push(username);

      io.emit("scoreUpdatedLogo", {
        username,
        score: logoScores[username],
        points: -1, // ⭐ ส่งค่า -1 ให้ Frontend แสดง alert
      });

      io.emit("logoLeaderboard", getLogoLeaderboard());
      return;
    }

    // 🎯 ตอบถูก (เหมือนเดิม)
    const elapsedSec = (now - startedAt) / 1000;
    let points = 1;
    if (elapsedSec <= 2) points = 3;
    else if (elapsedSec <= 4) points = 2;

    if (!logoScores[username]) logoScores[username] = 0;
    logoScores[username] += points;

    answeredUsers.push(username);

    io.emit("scoreUpdatedLogo", {
      username,
      score: logoScores[username],
      points,
    });

    io.emit("logoLeaderboard", getLogoLeaderboard());
  });

  // Admin reset เกมส์โลโก้ทั้งหมด (คะแนน + รอบ)
  socket.on("resetLogoGame", () => {
    logoScores = {};
    currentLogoRound = null;
    io.emit("logoGameReset");
    io.emit("logoLeaderboard", []);
    console.log("🧹 Logo Quiz reset by admin");
  });

  // ───────────────────────────────
  // 🔴 Disconnect
  // ───────────────────────────────
  socket.on("disconnect", () => {
    const username = users[socket.id];
    delete users[socket.id];
    io.emit("updateUsers", Object.values(users));
    console.log(`${username} disconnected.`);
  });
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

require("dotenv").config(); // Load environment variables
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");
const { db, firestore } = require("./firebase");
const { startMatchmaking } = require("./matchmaking");
const {
  selectCard,
  selectAbility,
  endBattle,
} = require("./controllers/battleController");
const { endRound } = require("./phaseController");
const axios = require("axios");
const { telegramWebhookHandler, sendInviteHandler } = require("./botStart");
const { setTutorialFlag } = require("./controllers/tutorialController");
const { cardsAdminRoutes } = require("./routes/cardsAdmin");
const { userDataAdminRoutes } = require("./routes/userDataAdmin");
const pool = require("./db");

// -------------------- APP SETUP --------------------
const app = express();

// Security & CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["*"];
app.use(
  cors({
    origin: "*", // Allow any origin
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true, // optional, if you need cookies/auth
  })
);

app.use(express.json());

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 sec
  max: 50, // max 50 requests per window per IP
  message: "Too many requests, try again later.",
});
app.use("/api/", apiLimiter);

// -------------------- SOCKET.IO SETUP --------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow any origin
    methods: ["GET", "POST"],
    credentials: true, // optional if using cookies or auth
  },
});

const connectedUsers = {}; // Map userId => socketId

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("register", (userId) => {
    connectedUsers[userId] = socket.id;
    socket.userId = userId; // attach userId to socket for reconnect tracking
    console.log(`User registered: ${userId}`);
  });

  socket.on("reconnect_attempt", () => {
    console.log(`Socket ${socket.id} attempting to reconnect...`);
  });

  socket.on("disconnect", (reason) => {
    if (socket.userId && connectedUsers[socket.userId] === socket.id) {
      delete connectedUsers[socket.userId];
      console.log(`User disconnected: ${socket.userId} | Reason: ${reason}`);
    }
  });
});

// Emit helper for matchmaking
const emitMatchFound = (userId, matchData) => {
  const socketId = connectedUsers[userId];
  if (socketId) io.to(socketId).emit("match-found", matchData);
};

// -------------------- EXPRESS ROUTES --------------------
app.get("/", (req, res) => res.send("⚔️ Clash Warriors backend is alive 🚀"));

// Matchmaking endpoint
app.post("/join-matchmaking", async (req, res, next) => {
  try {
    const { userId, userName, synergy, photo_url } = req.body;
    if (!userId || !userName || synergy === undefined) {
      return res.status(400).json({ error: "Missing user data" });
    }

    await db.ref(`matchmakingQueue/${userId}`).set({
      userId,
      userName,
      synergy,
      joinedAt: Date.now(),
      photo_url,
    });

    console.log(`User joined matchmaking: ${userName}`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Battle routes
app.post("/api/battle/:matchId/select-card", selectCard);
app.post("/api/battle/:matchId/select-ability", selectAbility);
app.post("/api/battle/:matchId/endTurn", async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { playerId } = req.body;
    await endRound(matchId, playerId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/battle/:matchId/cancelMatch", async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { playerId } = req.body;
    if (!matchId || !playerId)
      return res.status(400).json({ error: "matchId and playerId required" });

    await endBattle(matchId, playerId);
    res.json({ message: "Match cancelled, loser announced" });
  } catch (err) {
    next(err);
  }
});

// Telegram & invite routes
app.post("/telegram-bot", telegramWebhookHandler);
app.post("/send-invite", sendInviteHandler);
app.post("/api/set-tutorial-flag", setTutorialFlag);

app.get("/invite/:referrerId", (req, res) => {
  const { referrerId } = req.params;

  // Render HTML with OG tags
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Join Clash Warriors!</title>
      <meta name="description" content="Join Clash Warriors, earn $WARS tokens, and battle your friends!">
      
      <!-- Open Graph / Facebook -->
      <meta property="og:type" content="website">
      <meta property="og:url" content="https://share.clashwarriors.tech/invite/${referrerId}">
      <meta property="og:title" content="Join Clash Warriors!">
      <meta property="og:description" content="Battle in real-time PvP, earn $WARS tokens, and unlock heroes!">
      <meta property="og:image" content="https://adorable-fudge-c73118.netlify.app/assets/social/test.png">
      
      <!-- Twitter -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Join Clash Warriors!">
      <meta name="twitter:description" content="Battle in real-time PvP, earn $WARS tokens, and unlock heroes!">
      <meta name="twitter:image" content="https://adorable-fudge-c73118.netlify.app/assets/social/test.png">
    </head>
    <body>
      <script>
        // Redirect to the bot start link with referrerId
        window.location.href = "https://t.me/clash_warriors_bot?start=${referrerId}";
      </script>
      <p>Redirecting to Telegram...</p>
    </body>
    </html>
  `);
});

app.get("/battle-challenge/:matchCode", (req, res) => {
  const { matchCode } = req.params;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Join Clash Warriors Battle!</title>
      <meta name="description" content="Join Clash Warriors and play a friendly battle with your friend!">

      <!-- Open Graph / Facebook -->
      <meta property="og:type" content="website">
      <meta property="og:url" content="https://share.clashwarriors.tech/battle-challenge/${matchCode}">
      <meta property="og:title" content="Join Clash Warriors Battle!">
      <meta property="og:description" content="Battle in real-time PvP with friends and earn $WARS tokens!">
      <meta property="og:image" content="https://adorable-fudge-c73118.netlify.app/assets/social/test.png">

      <!-- Twitter -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Join Clash Warriors Battle!">
      <meta name="twitter:description" content="Battle in real-time PvP with friends and earn $WARS tokens!">
      <meta name="twitter:image" content="https://adorable-fudge-c73118.netlify.app/assets/social/test.png">
    </head>
    <body>
      <script>
        // Redirect to Telegram bot with friendly match payload
        window.location.href = "https://t.me/clash_warriors_bot?start=friendly_${matchCode}";
      </script>
      <p>Redirecting to Telegram...</p>
    </body>
    </html>
  `);
});

// Admin routes
app.use("/api", cardsAdminRoutes);
app.use("/api", userDataAdminRoutes);

// -------------------- Leaderboard Routes --------------------

app.get("/api/global-top100", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, first_name, last_name, photo_url, elo
       FROM leaderboard
       ORDER BY elo DESC
       LIMIT 100`
    );
    res.json(rows); // Returns only top 100 players
  } catch (err) {
    console.error("❌ Error fetching leaderboard:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

app.post("/api/sync-leaderboard", async (req, res) => {
  const { users } = req.body;
  if (!users || !users.length)
    return res.status(400).json({ error: "No users provided" });

  try {
    for (const user of users) {
      const { userId, first_name, last_name, photo_url, elo } = user;

      await pool.query(
        `INSERT INTO leaderboard (user_id, first_name, last_name, photo_url, elo)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (user_id) DO UPDATE
   SET first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       photo_url = EXCLUDED.photo_url,
       elo = EXCLUDED.elo`,
        [
          userId,
          (first_name || "").substring(0, 50),
          (last_name || "").substring(0, 50),
          photo_url || "",
          elo || 1000,
        ]
      );
    }

    res.json({ success: true, count: users.length });
  } catch (err) {
    console.error("❌ Error inserting leaderboard into PG:", err);
    res.status(500).json({ error: "Failed to sync leaderboard" });
  }
});

// -------------------- START MATCHMAKING --------------------
startMatchmaking(db, emitMatchFound);

// -------------------- ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// -------------------- SERVER LISTEN --------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Keep-alive ping for Render
if (process.env.RENDER_EXTERNAL_URL) {
  const SELF_URL = process.env.RENDER_EXTERNAL_URL;
  setInterval(async () => {
    try {
      await axios.get(SELF_URL);
      console.log("🔄 Keep-alive ping sent");
    } catch (err) {
      console.error("❌ Keep-alive ping failed:", err.message);
    }
  }, 40 * 1000);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down gracefully...");
  server.close(() => process.exit(0));
});

// Export io and emit helper
module.exports = { io, emitMatchFound, connectedUsers };

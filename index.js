const express = require("express");
const cors = require("cors");
const { db, firestore } = require("./firebase");
const { startMatchmaking } = require("./matchmaking");
const {
  selectCard,
  selectAbility,
  endBattle,
} = require("./controllers/battleController");
const { endRound } = require("./phaseController");
const axios = require("axios");
const { telegramWebhookHandler } = require("./botStart");
const { setTutorialFlag } = require("./controllers/tutorialController");

const app = express();

// ✅ Allow all origins
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("⚔️ Clash Warriors backend is alive 🚀");
});

// Start matchmaking interval
startMatchmaking(db, 500); // check every 500ms

// Endpoint to join queue
app.post("/join-matchmaking", async (req, res) => {
  const { userId, userName, synergy } = req.body;
  if (!userId || !userName || synergy === undefined) {
    return res.status(400).send({ error: "Missing user data" });
  }

  try {
    await db.ref(`matchmakingQueue/${userId}`).set({
      userId,
      userName,
      synergy,
      joinedAt: Date.now(),
    });
    console.log(`User joined matchmaking: ${userName}`);
    res.send({ success: true });
  } catch (err) {
    console.error("Error joining matchmaking:", err);
    res.status(500).send({ error: "Could not join queue" });
  }
});

// Battle routes
app.post("/api/battle/:matchId/select-card", selectCard);
app.post("/api/battle/:matchId/select-ability", selectAbility);
app.post("/api/battle/:matchId/endTurn", async (req, res) => {
  const { matchId } = req.params;
  const { playerId } = req.body;

  try {
    await endRound(matchId, playerId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Cancel match route
app.post("/api/battle/:matchId/cancelMatch", async (req, res) => {
  const { matchId } = req.params;
  const { playerId } = req.body;

  if (!matchId || !playerId) {
    return res.status(400).json({ error: "matchId and playerId required" });
  }

  try {
    await endBattle(matchId, playerId);
    return res
      .status(200)
      .json({ message: "Match cancelled, loser announced" });
  } catch (err) {
    console.error("Error cancelling match:", err);
    return res.status(500).json({ error: "Failed to cancel match" });
  }
});

app.post("/telegram-bot", telegramWebhookHandler);
app.post("/api/set-tutorial-flag", setTutorialFlag);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

if (process.env.RENDER_EXTERNAL_URL) {
  const SELF_URL = process.env.RENDER_EXTERNAL_URL;

  setInterval(async () => {
    try {
      await axios.get(SELF_URL);
      console.log("🔄 Keep-alive ping sent");
    } catch (err) {
      console.error("❌ Keep-alive ping failed:", err.message);
    }
  }, 40 * 1000); // ping every 40s
}

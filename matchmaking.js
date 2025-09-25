const { startPhaseLoop } = require("./phaseController");
const { startBotForMatch } = require("./controllers/botController"); // your bot script
const crypto = require("crypto");

const SYNERGY_TOLERANCE = 50;
const BOT_THRESHOLD = 5000; // 5 seconds
const BOT_PREFIX = "AIBOTPLAYER_";

function generateMatchId() {
  return crypto.randomBytes(3).toString("hex");
}

function generateBotId() {
  return BOT_PREFIX + crypto.randomBytes(3).toString("hex");
}

function startMatchmaking(db) {
  const queueRef = db.ref("matchmakingQueue");
  let processing = false;

  // Add bot to queue if a human has been waiting too long
  async function addBotFallback() {
    try {
      const snapshot = await queueRef.once("value");
      const users = snapshot.val() || {};

      for (const userId of Object.keys(users)) {
        const user = users[userId];

        // Skip bots
        if (user.userId.startsWith(BOT_PREFIX)) continue;

        const waitingTime = Date.now() - (user.joinedAt || Date.now());
        if (waitingTime >= BOT_THRESHOLD) {
          const botId = generateBotId();
          const botData = {
            userId: botId,
            userName: user.userName,
            synergy: user.synergy,
            joinedAt: Date.now(),
          };

          await queueRef.child(botId).set(botData);
          console.log(`Added bot ${botData.userId} for ${user.userName}`);
        }
      }
    } catch (err) {
      console.error("Bot fallback error:", err);
    }
  }

  async function processQueue() {
    if (processing) return;
    processing = true;

    try {
      const snapshot = await queueRef.once("value");
      let users = snapshot.val() || {};
      let userIds = Object.keys(users);
      let matchedThisBatch = new Set();
      let foundMatch = false;

      do {
        foundMatch = false;
        for (let i = 0; i < userIds.length; i++) {
          const u1Id = userIds[i];
          const u1 = users[u1Id];
          if (!u1 || matchedThisBatch.has(u1Id)) continue;

          for (let j = i + 1; j < userIds.length; j++) {
            const u2Id = userIds[j];
            const u2 = users[u2Id];
            if (!u2 || matchedThisBatch.has(u2Id)) continue;

            const synergyDiff = Math.abs(u1.synergy - u2.synergy);
            if (synergyDiff <= SYNERGY_TOLERANCE) {
              matchedThisBatch.add(u1Id);
              matchedThisBatch.add(u2Id);

              const matchId = generateMatchId();

              await Promise.all([
                queueRef.child(u1Id).remove(),
                queueRef.child(u2Id).remove(),
                db.ref(`ongoingBattles/${matchId}`).set({
                  matchId,
                  currentPhase: "cooldown",
                  winner: null,
                  phaseStartTime: Date.now(),
                  player1: u1,
                  player2: u2,
                  startedAt: Date.now(),
                  maxRounds: 4,
                  round: 1,
                  player1End: false,
                  player2End: false,
                }),
              ]);

              startPhaseLoop(matchId);

              console.log(
                `Matched ${u1.userName} with ${u2.userName} | Match ID: ${matchId}`
              );

              // ✅ Trigger bot if present
              if (
                u1.userId.startsWith(BOT_PREFIX) ||
                u2.userId.startsWith(BOT_PREFIX)
              ) {
                const botId = u1.userId.startsWith(BOT_PREFIX)
                  ? u1.userId
                  : u2.userId;
                startBotForMatch(matchId, botId);
                console.log(`Bot ${botId} started for Match ${matchId}`);
              }

              // Refresh snapshot
              users = (await queueRef.once("value")).val() || {};
              userIds = Object.keys(users);
              foundMatch = true;
              break;
            }
          }
          if (foundMatch) break;
        }
      } while (foundMatch);
    } catch (err) {
      console.error("Matchmaking error:", err);
    } finally {
      processing = false;
    }
  }

  // Trigger matchmaking on queue changes
  queueRef.on("child_added", () => processQueue());
  queueRef.on("child_removed", () => processQueue());

  // Regularly check queue for humans waiting too long
  setInterval(addBotFallback, 2000);
}

module.exports = { startMatchmaking };

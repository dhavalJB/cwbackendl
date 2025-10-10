const { startPhaseLoop } = require("./phaseController");
const { startBotForMatch } = require("./controllers/botController");
const crypto = require("crypto");
const names = require("./weights/names.json");

const SYNERGY_TOLERANCE = 50;
const BOT_THRESHOLD = 5000; // 5 seconds
const BOT_PREFIX = "AIBOTPLAYER_";

function generateMatchId() {
  return crypto.randomBytes(3).toString("hex");
}

function generateBotId() {
  return BOT_PREFIX + crypto.randomBytes(3).toString("hex");
}

function getRandomBotName() {
  const idx = Math.floor(Math.random() * names.length);
  return names[idx];
}

function startMatchmaking(db) {
  const queueRef = db.ref("matchmakingQueue");
  const tutorialQueueRef = db.ref("tutorialQueue"); // New tutorial queue
  const FRIENDLY_QUEUE_REF = db.ref("friendlyQueue");

  let processing = false;

  // Add bot to queue if a human has been waiting too long
  async function addBotFallback() {
    try {
      const snapshot = await queueRef.once("value");
      const users = snapshot.val() || {};

      for (const userId of Object.keys(users)) {
        const user = users[userId];

        if (user.userId.startsWith(BOT_PREFIX)) continue;

        const waitingTime = Date.now() - (user.joinedAt || Date.now());
        if (waitingTime >= BOT_THRESHOLD) {
          const botId = generateBotId();
          const botData = {
            userId: botId,
            userName: getRandomBotName(),
            synergy: user.synergy,
            initialSynergy: user.synergy,
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

  // ---------------- Tutorial Queue Processing ----------------
  async function processTutorialQueue() {
    try {
      const snapshot = await tutorialQueueRef.once("value");
      const tutorialUsers = snapshot.val() || {};

      for (const userId of Object.keys(tutorialUsers)) {
        const user = tutorialUsers[userId];

        if (!user) continue;

        // Immediately assign a bot
        const botId = generateBotId();
        const botData = {
          userId: botId,
          userName: "Tutorial Bot",
          synergy: user.synergy,
          initialSynergy: user.synergy,
          joinedAt: Date.now(),
        };

        const matchId = generateMatchId();

        await Promise.all([
          tutorialQueueRef.child(userId).remove(),
          db.ref(`ongoingBattles/${matchId}`).set({
            matchId,
            currentPhase: "cooldown",
            winner: null,
            phaseStartTime: Date.now(),
            player1: user,
            player2: botData,
            startedAt: Date.now(),
            maxRounds: 1, // tutorial can have 1 round
            round: 1,
            player1End: false,
            player2End: false,
            timersType: "tutorial", // Important: tutorial timers
          }),
        ]);
        // Set ongoingBattlesIndex
        const indexRef = db.ref(`ongoingBattlesIndex/${matchId}`);
        await indexRef.set({
          player1: u1,
          player2: u2,
          status: "waiting",
        });

        // Remove after 5 seconds
        setTimeout(() => {
          (async () => {
            await indexRef.remove();
            console.log(
              `ongoingBattlesIndex/${matchId} removed after 5 seconds`
            );
          })();
        }, 5000);

        // Remove after 5 seconds
        setTimeout(async () => {
          await indexRef.remove();
          console.log(`ongoingBattlesIndex/${matchId} removed after 5 seconds`);
        }, 5000);

        console.log(
          `Tutorial user ${user.userName} assigned bot ${botId} | Match ID: ${matchId}`
        );
        startPhaseLoop(matchId);
        startBotForMatch(matchId, botId);
      }
    } catch (err) {
      console.error("Tutorial queue error:", err);
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
                  timersType: "normal",
                }),
              ]);

              // Set ongoingBattlesIndex
              const indexRef = db.ref(`ongoingBattlesIndex/${matchId}`);
              await indexRef.set({
                player1: u1,
                player2: u2,
                status: "waiting",
              });

              // Remove after 5 seconds
              setTimeout(() => {
                (async () => {
                  await indexRef.remove();
                  console.log(
                    `ongoingBattlesIndex/${matchId} removed after 5 seconds`
                  );
                })();
              }, 5000);

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

  // ---------------- Friendly Queue ----------------
  async function processFriendlyQueue() {
    try {
      const snapshot = await FRIENDLY_QUEUE_REF.once("value");
      const matches = snapshot.val() || {};

      for (const matchId of Object.keys(matches)) {
        const match = matches[matchId];

        // Only proceed if both players exist
        if (match.player1 && match.player2) {
          const player1Data = {
            ...match.player1,
            synergy: Number(match.player1.synergy),
            initialSynergy: Number(match.player1.initialSynergy),
            joinedAt: match.player1.joinedAt || Date.now(),
            photoDP: match.player1.photoDP || "",
          };

          const player2Data = match.player2
            ? {
                ...match.player2,
                synergy: Number(match.player2.synergy),
                initialSynergy: Number(match.player2.initialSynergy),
                joinedAt: match.player2.joinedAt || Date.now(),
                photoDP: match.player2.photoDP || "",
              }
            : null;
          await Promise.all([
            FRIENDLY_QUEUE_REF.child(matchId).remove(),
            db.ref(`ongoingBattles/${matchId}`).set({
              matchId, // use the key from friendlyQueue directly
              currentPhase: "cooldown",
              winner: null,
              phaseStartTime: Date.now(),
              player1: player1Data,
              player2: player2Data,
              startedAt: Date.now(),
              maxRounds: 4,
              round: 1,
              player1End: false,
              player2End: false,
              timersType: "normal",
            }),
          ]);

          // Set ongoingBattlesIndex
          const indexRef = db.ref(`friendlyBattlesIndex/${matchId}`);
          await indexRef.set({
            player1: u1,
            player2: u2,
            status: "waiting",
          });

          // Remove after 5 seconds
          setTimeout(() => {
            (async () => {
              await indexRef.remove();
              console.log(
                `friendlyBattlesIndex/${matchId} removed after 5 seconds`
              );
            })();
          }, 5000);
          console.log(
            `Friendly match started: ${match.player1.userName} vs ${match.player2.userName} | Match ID: ${matchId}`
          );

          startPhaseLoop(matchId);

          // Start bot if any
          if (
            match.player1.userId.startsWith(BOT_PREFIX) ||
            match.player2.userId.startsWith(BOT_PREFIX)
          ) {
            const botId = match.player1.userId.startsWith(BOT_PREFIX)
              ? match.player1.userId
              : match.player2.userId;
            startBotForMatch(matchId, botId);
            console.log(`Bot ${botId} started for Friendly Match ${matchId}`);
          }
        }
      }
    } catch (err) {
      console.error("Friendly queue error:", err);
    }
  }

  // Trigger matchmaking on queue changes
  queueRef.on("child_added", () => processQueue());
  queueRef.on("child_removed", () => processQueue());

  FRIENDLY_QUEUE_REF.on("child_added", () => processFriendlyQueue());
  FRIENDLY_QUEUE_REF.on("child_removed", () => processFriendlyQueue());

  // Regularly check queue for humans waiting too long
  setInterval(addBotFallback, 2000);
  setInterval(processTutorialQueue, 1000);
  setInterval(processFriendlyQueue, 1000);
}

module.exports = { startMatchmaking };

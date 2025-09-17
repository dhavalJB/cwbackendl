const { startPhaseLoop } = require("./phaseController");

const crypto = require("crypto");
const SYNERGY_TOLERANCE = 50;

function generateMatchId() {
  return crypto.randomBytes(3).toString("hex");
}

function startMatchmaking(db) {
  const queueRef = db.ref("matchmakingQueue");
  let processing = false;

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

              // Refresh queue snapshot after removal
              users = (await queueRef.once("value")).val() || {};
              userIds = Object.keys(users);
              foundMatch = true;
              break; // restart outer loop fresh
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

  // Whenever a user joins the queue, try matching
  queueRef.on("child_added", () => {
    processQueue();
  });

  // Whenever a user leaves (after a match), also re-check
  queueRef.on("child_removed", () => {
    processQueue();
  });
}

module.exports = { startMatchmaking };

const { db } = require("./firebase");
const { saveRoundData } = require("./controllers/battleController");
const { PHASE_TIMERS, MAX_ROUNDS } = require("./weights/phaseConstants");
const executeBattlePhase = require("./battleLogics");

const activeTimers = {}; // single timer per match

// Phase structure
const PHASES_PER_ROUND = {
  first: ["cooldown", "selection", "battle"],
  normal: ["selection", "battle"],
};

// ---------------- ROLE ASSIGNER ----------------
async function roleAssigner(matchRef, round, isFirstRound = false) {
  const snap = await matchRef.get();
  const matchData = snap.val();
  if (!matchData?.player1 || !matchData?.player2) return;

  const { player1, player2 } = matchData;
  let player1Role, player2Role;

  if (isFirstRound) {
    player1Role =
      (player1.synergy || 0) >= (player2.synergy || 0) ? "attack" : "defense";
    player2Role = player1Role === "attack" ? "defense" : "attack";
  } else {
    player1Role = player1.currentRole === "attack" ? "defense" : "attack";
    player2Role = player2.currentRole === "attack" ? "defense" : "attack";
  }

  await matchRef.update({
    "player1/currentRole": player1Role,
    "player2/currentRole": player2Role,
  });

  console.log(
    `[Match ${matchRef.key}] → Roles assigned | Round ${round}: Player1=${player1Role}, Player2=${player2Role}`
  );
}

// ---------------- MAIN LOOP ----------------
async function startPhaseLoop(matchId, startRound = 1, startPhaseIndex = 0) {
  const matchRef = db.ref(`ongoingBattles/${matchId}`);

  async function runPhase(round, phaseIndex) {
    const snap = await matchRef.get();
    const matchData = snap.val();
    if (!matchData) return;
    if (matchData.currentPhase === "cancelled") return;

    const maxRounds = matchData.maxRounds || MAX_ROUNDS;
    if (round > maxRounds) {
      console.log(`[Match ${matchId}] → Max rounds reached. Finishing match.`);
      await finishMatch(matchId);
      return;
    }

    // Get correct phase list for round
    const phases =
      round === 1 ? PHASES_PER_ROUND.first : PHASES_PER_ROUND.normal;
    const phase = phases[phaseIndex];

    if (!phase) {
      // Round finished → next round
      await runPhase(round + 1, 0);
      return;
    }

    // Timer setup
    let timer =
      PHASE_TIMERS.get(phase, round - 1, matchData.timersType || "normal") ||
      5000;

    // Skip selection if both ended
    if (phase === "selection" && matchData.player1End && matchData.player2End) {
      console.log(`[Match ${matchId}] → Skipping selection → Battle`);
      await matchRef.update({ player1End: false, player2End: false });
      await runPhase(round, phaseIndex + 1);
      return;
    }

    // Update DB
    await matchRef.update({
      currentPhase: phase,
      currentRound: round,
      currentPhaseIndex: phaseIndex,
      phaseStartTime: Date.now(),
    });

    console.log(
      `[Match ${matchId}] → Round ${round} | Phase ${phase} | Index ${phaseIndex}`
    );

    // ---- Phase Behaviors ----
    if (phase === "cooldown" || phase === "selection") {
      await roleAssigner(matchRef, round, phase === "cooldown");
      if (!matchData.maxSynergy) {
        const { player1, player2 } = matchData;
        const maxSynergy = Math.max(
          player1.initialSynergy || player1.synergy || 0,
          player2.initialSynergy || player2.synergy || 0
        );
        await matchRef.update({ maxSynergy });
      }
    }

    if (phase === "battle") {
      console.log(`[Match ${matchId}] → Battle started (Round ${round})`);
      await executeBattlePhase(matchId);
      await saveRoundData(matchId, round);
      await matchRef.update({ player1End: false, player2End: false });
      console.log(`[Match ${matchId}] → Round ${round} saved`);
    }

    // ---- Timer Handling ----
    if (activeTimers[matchId]) clearTimeout(activeTimers[matchId]);
    activeTimers[matchId] = setTimeout(async () => {
      delete activeTimers[matchId];
      await runPhase(round, phaseIndex + 1);
    }, timer);
  }

  runPhase(startRound, startPhaseIndex);
}

// ---------------- END ROUND ----------------
async function endRound(matchId, playerId) {
  const matchRef = db.ref(`ongoingBattles/${matchId}`);
  const snap = await matchRef.get();
  const matchData = snap.val();
  if (!matchData) throw new Error("Match not found");

  // Prevent duplicate end
  if (
    (playerId === matchData.player1.userId && matchData.player1End) ||
    (playerId === matchData.player2.userId && matchData.player2End)
  ) {
    console.log(`[Match ${matchId}] → Duplicate end ignored for ${playerId}`);
    return;
  }

  const updateObj = {};
  if (matchData.player1.userId === playerId) updateObj.player1End = true;
  else if (matchData.player2.userId === playerId) updateObj.player2End = true;

  await matchRef.update(updateObj);

  const updated = (await matchRef.get()).val();

  if (
    updated.player1End &&
    updated.player2End &&
    updated.currentPhase === "selection"
  ) {
    console.log(`[Match ${matchId}] → Both players ended → skipping to battle`);
    if (activeTimers[matchId]) clearTimeout(activeTimers[matchId]);
    delete activeTimers[matchId];
    await startPhaseLoop(matchId, updated.currentRound, 1); // jump directly to battle
  }
}

// ---------------- FINISH MATCH ----------------
async function finishMatch(matchId) {
  if (activeTimers[matchId]) {
    clearTimeout(activeTimers[matchId]);
    delete activeTimers[matchId];
  }

  const matchRef = db.ref(`ongoingBattles/${matchId}`);
  const snap = await matchRef.get();
  const matchData = snap.val();
  if (!matchData) return;

  const { player1, player2 } = matchData;
  let winnerId = null;
  let loserId = null;

  if (player1.synergy > player2.synergy) {
    winnerId = player1.userId;
    loserId = player2.userId;
  } else if (player2.synergy > player1.synergy) {
    winnerId = player2.userId;
    loserId = player1.userId;
  }

  await matchRef.update({ currentPhase: "finished", winnerId, loserId });

  console.log(`[Match ${matchId}] ✅ Finished | Winner: ${winnerId || "Draw"}`);

  const cleanupDelay =
    PHASE_TIMERS.get("finished", matchData.currentRound || 0) || 5000;

  activeTimers[matchId] = setTimeout(async () => {
    await matchRef.remove();
    delete activeTimers[matchId];
    console.log(`[Match ${matchId}] 🔥 Deleted from ongoingBattles`);
  }, cleanupDelay);
}

module.exports = { startPhaseLoop, endRound };

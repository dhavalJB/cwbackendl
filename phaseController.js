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

// ---------------- START PHASE LOOP ----------------
async function startPhaseLoop(matchId, startRound = 0, startPhaseIndex = 0) {
  const matchRef = db.ref(`ongoingBattles/${matchId}`);

  async function runPhase(round, phaseIndex) {
    const snap = await matchRef.get();
    const matchData = snap.val();
    if (!matchData) return;
    if (matchData.currentPhase === "cancelled") return;

    const maxRounds = matchData.maxRounds || MAX_ROUNDS;
    if (round > maxRounds - 1) {
      console.log(`[Match ${matchId}] → Max rounds reached. Finishing match.`);
      await finishMatch(matchId);
      return;
    }

    const phases =
      round === 0 ? PHASES_PER_ROUND.first : PHASES_PER_ROUND.normal;
    const phase = phases[phaseIndex];

    if (!phase) {
      // Move to next round
      await runPhase(round + 1, 0);
      return;
    }

    const timer =
      PHASE_TIMERS.get(phase, round, matchData.timersType || "normal") || 5000;

    // Skip selection if both players ended
    if (phase === "selection" && matchData.player1End && matchData.player2End) {
      console.log(`[Match ${matchId}] → Skipping selection → Battle`);
      await matchRef.update({ player1End: false, player2End: false });
      await runPhase(round, phaseIndex + 1);
      return;
    }

    // Clear currentRound only once at the start of selection
    if (phase === "selection" && !matchData.selectionStarted) {
      await matchRef.update({
        currentRound: {},
        selectionStarted: true, // lock so we don't clear again
      });
      console.log(
        `[Match ${matchId}] → currentRound cleared as selection phase starts`
      );
    }

    // Update phase info without overwriting currentRound during battle
    await matchRef.update({
      currentPhase: phase,
      currentPhaseIndex: phaseIndex,
      numericRound: round,
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

    if (phase === "selection") {
      // Clear previous round
      await matchRef.update({ currentRound: {} });

      // Players make selections here
      console.log(`[Match ${matchId}] → Selection phase started`);

      // Save round immediately after selections
      await saveRoundData(matchId, round);
    }

    if (phase === "battle") {
      console.log(`[Match ${matchId}] → Battle phase started`);
      await executeBattlePhase(matchId);

      // Reset player end flags for next selection
      await matchRef.update({ player1End: false, player2End: false });

      console.log(`[Match ${matchId}] → Battle completed`);
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

    // Jump directly to battle, selectionStarted will remain true until battle completes
    await startPhaseLoop(matchId, updated.numericRound, 1);
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
    PHASE_TIMERS.get("finished", matchData.numericRound || 0) || 3000;

  activeTimers[matchId] = setTimeout(async () => {
    await matchRef.remove();
    delete activeTimers[matchId];
    console.log(`[Match ${matchId}] 🔥 Deleted from ongoingBattles`);
  }, cleanupDelay);
}

module.exports = { startPhaseLoop, endRound };

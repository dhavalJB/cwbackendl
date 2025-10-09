const { db } = require("./firebase");
const { saveRoundData } = require("./controllers/battleController");
const {
  PHASES,
  PHASE_TIMERS,
  MAX_ROUNDS,
} = require("./weights/phaseConstants");
const executeBattlePhase = require("./battleLogics");

const activeTimers = {}; // single timer per match

// ---------------- Role Assigner ----------------
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
    `[Match ${matchRef.key}] -> Roles assigned | Round ${round}: Player1=${player1Role}, Player2=${player2Role}`
  );
}

// ---------------- End Round ----------------
async function endRound(matchId, playerId) {
  const matchRef = db.ref(`ongoingBattles/${matchId}`);
  const snap = await matchRef.get();
  const matchData = snap.val();
  if (!matchData) throw new Error("Match not found");

  const updateObj = {};
  if (matchData.player1.userId === playerId) updateObj.player1End = true;
  else if (matchData.player2.userId === playerId) updateObj.player2End = true;
  else throw new Error("Invalid playerId");

  await matchRef.update(updateObj);

  const updatedSnap = await matchRef.get();
  const updatedData = updatedSnap.val();

  // Skip selection if both ended
  if (
    updatedData.player1End &&
    updatedData.player2End &&
    updatedData.currentPhase === "selection"
  ) {
    console.log(`[Match ${matchId}] -> Both players ended, skipping to battle`);
    if (activeTimers[matchId]) {
      clearTimeout(activeTimers[matchId]);
      delete activeTimers[matchId];
    }
    await startPhaseLoop(
      matchId,
      updatedData.currentPhaseIndex + 1,
      updatedData.currentRound
    );
  }
}

// ---------------- Phase Loop ----------------
async function startPhaseLoop(matchId, startIndex = 0, startRound = 0) {
  const matchRef = db.ref(`ongoingBattles/${matchId}`);

  async function nextPhase(phaseIndex = startIndex, round = startRound) {
    const snap = await matchRef.get();
    const matchData = snap.val();
    if (!matchData || matchData.currentPhase === "cancelled") return;

    // Max rounds check
    if (round >= MAX_ROUNDS) {
      console.log(`[Match ${matchId}] -> Max rounds reached, finishing match.`);
      await finishMatch(matchId);
      return;
    }

    if (phaseIndex >= PHASES.length) {
      // All phases done for this round, move to next round
      await nextPhase(0, round + 1);
      return;
    }

    let phase = PHASES[phaseIndex];
    let timer = PHASE_TIMERS.get(
      phase,
      round,
      matchData.timersType || "normal"
    );

    // Skip selection if both ended
    if (phase === "selection" && matchData.player1End && matchData.player2End) {
      phase = "battle";
      timer = 0;
      await matchRef.update({ player1End: false, player2End: false });
    }

    // Update Firebase with current phase info
    await matchRef.update({
      currentPhase: phase,
      currentPhaseIndex: phaseIndex,
      currentRound: round,
      phaseStartTime: Date.now(),
    });

    console.log(
      `[Match ${matchId}] -> Phase: ${phase} | Round: ${round} | PhaseIndex: ${phaseIndex}`
    );

    // Role Assignment
    if (phase === "cooldown" || phase === "selection") {
      const isFirstSelection = round === 0 && phaseIndex === 0;
      await roleAssigner(matchRef, round, isFirstSelection);

      if (!matchData.maxSynergy) {
        const { player1, player2 } = matchData;
        const maxSynergy = Math.max(
          player1.initialSynergy || player1.synergy || 0,
          player2.initialSynergy || player2.synergy || 0
        );
        await matchRef.update({ maxSynergy });
        console.log(
          `[Match ${matchRef.key}] -> maxSynergy set to ${maxSynergy}`
        );
      }
    }

    // Battle Phase
    if (phase === "battle") {
      console.log(`[Match ${matchId}] -> Battle started for Round ${round}`);
      await executeBattlePhase(matchId);

      if (activeTimers[matchId]) clearTimeout(activeTimers[matchId]);

      activeTimers[matchId] = setTimeout(async () => {
        await saveRoundData(matchId, round);
        await matchRef.update({ player1End: false, player2End: false });
        console.log(`[Match ${matchId}] -> Round ${round} saved`);

        // Next phase in same round
        await nextPhase(phaseIndex + 1, round);
        delete activeTimers[matchId];
      }, timer);

      return;
    }

    // Finished Phase
    if (phase === "finished") {
      await finishMatch(matchId);
      return;
    }

    // Schedule next phase for non-battle
    if (activeTimers[matchId]) clearTimeout(activeTimers[matchId]);
    activeTimers[matchId] = setTimeout(async () => {
      await nextPhase(phaseIndex + 1, round);
      delete activeTimers[matchId];
    }, timer);
  }

  nextPhase(startIndex, startRound);
}

// ---------------- Finish Match ----------------
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
  const winnerId =
    player1.synergy > player2.synergy
      ? player1.userId
      : player2.synergy > player1.synergy
      ? player2.userId
      : false;
  const loserId =
    winnerId === player1.userId
      ? player2.userId
      : winnerId === player2.userId
      ? player1.userId
      : false;

  await matchRef.update({ currentPhase: "finished", winnerId, loserId });
  console.log(
    `[Match ${matchId}] -> Winner: ${winnerId || "Draw"} | Loser: ${
      loserId || "None"
    }`
  );

  const finishedTimer =
    PHASE_TIMERS.get(
      "finished",
      matchData.currentRound || 0,
      matchData.timersType || "normal"
    ) || 5000;
  activeTimers[matchId] = setTimeout(async () => {
    await matchRef.remove();
    console.log(`[Match ${matchId}] -> Deleted from ongoingBattles`);
    delete activeTimers[matchId];
  }, finishedTimer);
}

module.exports = { startPhaseLoop, endRound };

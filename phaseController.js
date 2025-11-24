const { db } = require("./firebase");
const { saveRoundData } = require("./controllers/battleController");
const { PHASE_TIMERS, MAX_ROUNDS } = require("./weights/phaseConstants");
const executeBattlePhase = require("./battleLogics");
const axios = require("axios");
const pool = require("./db");

const activeTimers = {}; // single timer per match

// Phase structure
const PHASES_PER_ROUND = {
  first: ["cooldown", "selection", "battle"],
  normal: ["selection", "battle"],
};

function calculateElo(winnerElo, loserElo, k = 32) {
  const expectedWinner = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const expectedLoser = 1 / (1 + 10 ** ((winnerElo - loserElo) / 400));

  const newWinnerElo = Math.round(winnerElo + k * (1 - expectedWinner));
  const newLoserElo = Math.round(loserElo + k * (0 - expectedLoser));

  return { newWinnerElo, newLoserElo };
}

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

  let winnerElo = null;
  let loserElo = null;

  // ---- Fetch ELO only for human players ----
  try {
    if (winnerId && !winnerId.startsWith("AIBOTPLAYER")) {
      const { rows } = await pool.query(
        "SELECT elo FROM leaderboard WHERE user_id = $1",
        [winnerId]
      );
      winnerElo = rows[0]?.elo || 1200;
    }

    if (loserId && !loserId.startsWith("AIBOTPLAYER")) {
      const { rows } = await pool.query(
        "SELECT elo FROM leaderboard WHERE user_id = $1",
        [loserId]
      );
      loserElo = rows[0]?.elo || 1200;
    }
  } catch (err) {
    console.error("Failed to fetch ELO from SQL:", err);
  }

  // ---- Calculate new ELO if at least one human player ----
  if (winnerElo !== null || loserElo !== null) {
    const { newWinnerElo, newLoserElo } = calculateElo(
      winnerElo || 1200,
      loserElo || 1200
    );

    // ---- Update ELO in SQL for human players only ----
    try {
      if (winnerElo !== null) {
        await pool.query("UPDATE leaderboard SET elo = $1 WHERE user_id = $2", [
          newWinnerElo,
          winnerId,
        ]);
      }

      if (loserElo !== null) {
        await pool.query("UPDATE leaderboard SET elo = $1 WHERE user_id = $2", [
          newLoserElo,
          loserId,
        ]);
      }

      console.log(
        `[Match ${matchId}] 🔹 Updated ELO | Winner: ${
          newWinnerElo || "-"
        }, Loser: ${newLoserElo || "-"}`
      );
    } catch (err) {
      console.error("Failed to update ELO in SQL:", err);
    }
  }

  // ---- Stake Mode Settlement ----
  try {
    const p1Stake = player1.mode === "stake";
    const p2Stake = player2.mode === "stake";

    if (p1Stake || p2Stake) {
      const url = "https://onchain.clashwarriors.tech/battle-report";

      // Case 1: both stake
      if (p1Stake && p2Stake) {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            winnerWalletId:
              winnerId === player1.userId ? player1.walletId : player2.walletId,
            loserWalletId:
              loserId === player1.userId ? player1.walletId : player2.walletId,
          }),
        });

        console.log(
          `[Match ${matchId}] 🔗 Sent duel stake report (2 players).`
        );
      }

      // Case 2: only one stake user
      else {
        let stakePlayer = p1Stake ? player1 : player2;
        let result = stakePlayer.userId === winnerId ? "win" : "lose";

        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletId: stakePlayer.walletId,
            result,
          }),
        });

        console.log(
          `[Match ${matchId}] 🔗 Sent single stake report: ${stakePlayer.walletId} → ${result}`
        );
      }
    }
  } catch (err) {
    console.error(`[Match ${matchId}] ❌ Stake report failed`, err);
  }

  // ---- Cleanup ----
  const cleanupDelay =
    PHASE_TIMERS.get("finished", matchData.numericRound || 0) || 10000;

  activeTimers[matchId] = setTimeout(async () => {
    await matchRef.remove();
    delete activeTimers[matchId];
    console.log(`[Match ${matchId}] 🔥 Deleted from ongoingBattles`);
  }, cleanupDelay);
}

module.exports = { startPhaseLoop, endRound };

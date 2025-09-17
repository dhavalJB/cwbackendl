// controllers/battleController.js
const { ref, get, update } = require("firebase/database");
const { db } = require("../firebase");
const { PHASES, PHASE_TIMERS } = require("../weights/phaseConstants");

// ----------------- CARD SELECTION -----------------
const selectCard = async (req, res) => {
  const { matchId } = req.params;
  const { playerId, cardId, photo, stats } = req.body;

  try {
    const matchRef = ref(db, `ongoingBattles/${matchId}`);
    const snapshot = await get(matchRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Match not found" });
    }

    const match = snapshot.val();
    if (match.currentPhase !== "selection") {
      return res.status(400).json({ error: "Not in selection phase" });
    }

    const playerKey =
      match.player1?.playerId === playerId
        ? "player1"
        : match.player2?.playerId === playerId
        ? "player2"
        : null;

    if (!playerKey) {
      return res.status(400).json({ error: "Invalid player" });
    }

    if (match[playerKey]?.currentRound?.cardId) {
      return res
        .status(400)
        .json({ error: "Card already selected this round" });
    }

    await update(
      ref(db, `ongoingBattles/${matchId}/${playerKey}/currentRound`),
      {
        cardId,
        cardPhotoSrc: photo,
        stats,
      }
    );

    res.json({ success: true, message: "Card selected" });
  } catch (err) {
    console.error("Error selecting card:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ----------------- ABILITY SELECTION -----------------
const selectAbility = async (req, res) => {
  const { matchId } = req.params;
  const { playerId, abilityKey } = req.body;

  try {
    const matchRef = ref(db, `ongoingBattles/${matchId}`);
    const snapshot = await get(matchRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Match not found" });
    }

    const match = snapshot.val();
    if (match.currentPhase !== "selection") {
      return res.status(400).json({ error: "Not in selection phase" });
    }

    const playerKey =
      match.player1?.playerId === playerId
        ? "player1"
        : match.player2?.playerId === playerId
        ? "player2"
        : null;

    if (!playerKey) {
      return res.status(400).json({ error: "Invalid player" });
    }

    await update(
      ref(db, `ongoingBattles/${matchId}/${playerKey}/currentRound`),
      {
        abilitySelected: abilityKey,
      }
    );

    res.json({ success: true, message: `Ability ${abilityKey} selected` });
  } catch (err) {
    console.error("Error selecting ability:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Saves current round data into previousRounds and clears currentRound
 */
async function saveRoundData(matchId, round) {
  const matchRef = db.ref(`ongoingBattles/${matchId}`);

  try {
    const snap = await matchRef.get();
    const matchData = snap.val();

    if (!matchData?.player1 || !matchData?.player2) {
      console.warn(`[Match ${matchId}] -> No player data found`);
      return;
    }

    const updates = {};

    // Only save round if player did something
    if (
      matchData.player1.currentRound?.cardId ||
      matchData.player1.currentRound?.abilitySelected
    ) {
      updates[`player1/previousRounds/round${round}`] = {
        cardId: matchData.player1.currentRound.cardId || null,
        ability: matchData.player1.currentRound.abilitySelected || null,
      };
    }

    if (
      matchData.player2.currentRound?.cardId ||
      matchData.player2.currentRound?.abilitySelected
    ) {
      updates[`player2/previousRounds/round${round}`] = {
        cardId: matchData.player2.currentRound.cardId || null,
        ability: matchData.player2.currentRound.abilitySelected || null,
      };
    }

    // Clear currentRound regardless
    updates[`player1/currentRound`] = null;
    updates[`player2/currentRound`] = null;

    // Only update if there’s something to update
    if (Object.keys(updates).length > 0) {
      await matchRef.update(updates);
      console.log(`[Match ${matchId}] -> Round ${round} saved`);
    } else {
      console.log(`[Match ${matchId}] -> Round ${round} skipped (no actions)`);
    }
  } catch (err) {
    console.error(`[Match ${matchId}] -> Error saving round data:`, err);
  }
}

/*
 * Cancel Battle (forfeit)
 * - Remove from ongoingBattles
 * - Notify opponent (out of scope for now)
 */

async function endBattle(matchId, loserId) {
  const matchRef = db.ref(`ongoingBattles/${matchId}`);
  try {

    const snap = await matchRef.once("value");
    const matchData = snap.val();
    if (!matchData?.player1 || !matchData?.player2) return;

    const { player1, player2 } = matchData;

    let winnerId;
    if (player1.userId === loserId) {
      winnerId = player2.userId;
    } else if (player2.userId === loserId) {
      winnerId = player1.userId;
    } else {
      winnerId = false; // fallback, unlikely
    }

    await matchRef.update({
      winnerId: winnerId || false,
      loserId: loserId,
      currentPhase: "cancelled",
      phaseStartTime: Date.now(),
    });

    console.log(
      `[Match ${matchId}] -> Match cancelled. Winner: ${winnerId}, Loser: ${loserId}`
    );

    // Cleanup after 5s
    setTimeout(async () => {
      await matchRef.remove();
      console.log(`[Match ${matchId}] -> Deleted from ongoingBattles`);
    }, 10000);
  } catch (err) {
    console.error(`[Match ${matchId}] -> Error ending battle:`, err);
  }
}

module.exports = {
  selectCard,
  selectAbility,
  saveRoundData,
  endBattle,
};

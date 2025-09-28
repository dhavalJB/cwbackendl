const { ref, get } = require("firebase/database");
const axios = require("axios");
const { db } = require("../firebase");

const {
  ABILITIES,
  ATTACK_ABILITIES,
  DEFENSE_ABILITIES,
} = require("../weights/abilityKey");

const MIN_DELAY = 1000; // 1s minimum delay
const MAX_DELAY = 3000; // 3s maximum delay

async function startBotForMatch(matchId, botId) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const matchRef = ref(db, `ongoingBattles/${matchId}`);
    const snapshot = await get(matchRef);
    if (!snapshot.exists()) {
      console.warn(`[Bot ${botId}] Match ${matchId} not found`);
      return;
    }

    const match = snapshot.val();
    let botKey = null;
    if (match.player1?.userId === botId) botKey = "player1";
    else if (match.player2?.userId === botId) botKey = "player2";
    else {
      console.warn(`[Bot ${botId}] is not part of match ${matchId}`);
      return;
    }

    console.log(`[Bot ${botId}] is in match ${matchId} as ${botKey}`);

    const botPlayer = match[botKey];
    const deckSize = botPlayer.availableCards
      ? Object.keys(botPlayer.availableCards).length
      : 0;
    if (deckSize !== 10) {
      console.warn(`[Bot ${botId}] ❌ has ${deckSize} cards in deck`);
      return;
    }
    console.log(`[Bot ${botId}] ✅ has 10 cards in deck`);

    // -------------------- Main selection loop --------------------
    const selectionLoop = async () => {
      try {
        const snap = await get(matchRef);
        const currentMatch = snap.val();
        if (!currentMatch) return;

        if (currentMatch.currentPhase !== "selection") {
          return setTimeout(selectionLoop, 1000);
        }

        const botData = currentMatch[botKey];
        const currentRound = botData.currentRound || {};

        // ---------------- Prevent duplicate selection ----------------
        if (currentRound.cardId && currentRound.abilitySelected) {
          return setTimeout(selectionLoop, 1000);
        }

        const prevRounds = botData.previousRounds || {};

        // ---------------- Collect used cards & abilities ----------------
        const usedCards = new Set();
        const usedAbilities = new Set();
        Object.values(prevRounds).forEach((round) => {
          if (round.cardId) usedCards.add(round.cardId);
          if (round.abilitySelected) usedAbilities.add(round.abilitySelected);
        });

        // ---------------- Pick a valid card ----------------
        let card = null;
        if (!currentRound.cardId) {
          const cardKeys = Object.keys(botData.availableCards || {});
          const validCards = cardKeys.filter(
            (key) => !usedCards.has(botData.availableCards[key].cardId)
          );
          if (validCards.length > 0) {
            const randomCardKey =
              validCards[Math.floor(Math.random() * validCards.length)];
            card = botData.availableCards[randomCardKey];
          } else {
            console.warn(`[Bot ${botId}] No unused cards left to play`);
          }
        }

        // ---------------- Pick a valid ability ----------------
        let abilityKey = null;
        if (!currentRound.abilitySelected) {
          const role = botData.currentRole; // 'attack' or 'defense'
          const abilityPool =
            role === "attack" ? ATTACK_ABILITIES : DEFENSE_ABILITIES;
          const validAbilities = abilityPool.filter(
            (key) => !usedAbilities.has(key)
          );
          abilityKey =
            validAbilities.length > 0
              ? validAbilities[
                  Math.floor(Math.random() * validAbilities.length)
                ]
              : abilityPool[Math.floor(Math.random() * abilityPool.length)];
        }

        const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);

        // ---------------- Execute after delay ----------------
        setTimeout(async () => {
          try {
            // 1️⃣ Select card if not already selected
            if (card) {
              await axios.post(
                `http://localhost:3000/api/battle/${matchId}/select-card`,
                {
                  playerId: botId,
                  cardId: card.cardId,
                  photo: card.cardPhotoSrc,
                  stats: card.stats,
                }
              );
              console.log(`[Bot ${botId}] selected card ${card.cardId}`);
            }

            // 2️⃣ Wait 0.5s before ability
            await new Promise((resolve) => setTimeout(resolve, 500));
            // 3️⃣ Select ability if not already selected
            if (abilityKey) {
              // Use human-readable name from ABILITIES map
              const abilityHumanName = ABILITIES[abilityKey];

              await axios.post(
                `http://localhost:3000/api/battle/${matchId}/select-ability`,
                {
                  playerId: botId,
                  abilityKey: abilityHumanName, // send "Aegis Ward" instead of "AEGIS_WARD"
                }
              );
              console.log(
                `[Bot ${botId}] selected ability ${abilityHumanName} (${abilityKey})`
              );
            }

            // 4️⃣ End bot turn immediately after both selections
            await axios.post(
              `http://localhost:3000/api/battle/${matchId}/endTurn`,
              {
                playerId: botId,
              }
            );
            console.log(`[Bot ${botId}] ended turn`);

            // Loop for next selection phase
            selectionLoop();
          } catch (err) {
            console.error(
              `[Bot ${botId}] Error selecting card/ability in match ${matchId}:`,
              err.message
            );
            selectionLoop();
          }
        }, delay);
      } catch (err) {
        console.error(`[Bot ${botId}] Error in selection loop:`, err.message);
        setTimeout(selectionLoop, 1000);
      }
    };

    selectionLoop();
  } catch (err) {
    console.error(`[Bot ${botId}] Error verifying deck:`, err.message);
  }
}

module.exports = { startBotForMatch };

// const { db } = require("./firebase");
// const { saveRoundData } = require("./controllers/battleController");
// const { PHASES, PHASE_TIMERS } = require("./weights/phaseConstants");
// const executeBattlePhase = require("./battleLogics");

// const activeTimers = {};

// // ----------------- Role Assigner -----------------
// async function roleAssigner(matchRef, round, isFirstRound = false) {
//   const snap = await matchRef.get();
//   const matchData = snap.val();
//   if (!matchData?.player1 || !matchData?.player2) return;

//   const { player1, player2 } = matchData;
//   let player1Role, player2Role;

//   if (isFirstRound) {
//     player1Role =
//       (player1.synergy || 0) >= (player2.synergy || 0) ? "attack" : "defense";
//     player2Role = player1Role === "attack" ? "defense" : "attack";
//   } else {
//     player1Role = player1.currentRole === "attack" ? "defense" : "attack";
//     player2Role = player2.currentRole === "attack" ? "defense" : "attack";
//   }

//   await matchRef.update({
//     "player1/currentRole": player1Role,
//     "player2/currentRole": player2Role,
//   });

//   console.log(
//     `[Match ${matchRef.key}] -> Roles assigned | Round ${round}: Player1=${player1Role}, Player2=${player2Role}`
//   );
// }

// // ----------------- End Round -----------------
// async function endRound(matchId, playerId) {
//   const matchRef = db.ref(`ongoingBattles/${matchId}`);
//   const snap = await matchRef.get();
//   const matchData = snap.val();
//   if (!matchData) throw new Error("Match not found");

//   const updateObj = {};
//   if (matchData.player1.userId === playerId) updateObj.player1End = true;
//   else if (matchData.player2.userId === playerId) updateObj.player2End = true;
//   else throw new Error("Invalid playerId");

//   await matchRef.update(updateObj);

//   // If both players ended during selection, skip remaining selection timer
//   const updatedSnap = await matchRef.get();
//   const updatedData = updatedSnap.val();
//   if (
//     updatedData.player1End &&
//     updatedData.player2End &&
//     updatedData.currentPhase === "selection"
//   ) {
//     console.log(`[Match ${matchId}] -> Both players ended, skipping to battle`);

//     // Clear existing timer
//     if (activeTimers[matchId]) {
//       clearTimeout(activeTimers[matchId]);
//       delete activeTimers[matchId];
//     }

//     // Start battle immediately
//     await startPhaseLoop(
//       matchId,
//       PHASES.indexOf("battle"),
//       updatedData.round || 0
//     );
//   }
// }

// // ----------------- Phase Loop -----------------
// async function startPhaseLoop(matchId, startIndex = 0, startRound = 0) {
//   const matchRef = db.ref(`ongoingBattles/${matchId}`);

//   async function nextPhase(currentIndex = startIndex, round = startRound) {
//     if (currentIndex >= PHASES.length) return;

//     const snap = await matchRef.get();
//     const matchData = snap.val();
//     if (!matchData) return;
//     if (matchData.currentPhase === "cancelled") return;

//     let phase = PHASES[currentIndex];
//     let timer = PHASE_TIMERS[phase];

//     // ----------------- Skip selection -> battle -----------------
//     if (phase === "selection") {
//       if (matchData.player1End && matchData.player2End) {
//         phase = "battle";
//         timer = 0;
//         await matchRef.update({ player1End: false, player2End: false });
//       }
//     }

//     await matchRef.update({
//       currentPhase: phase,
//       phaseStartTime: Date.now(),
//       round,
//     });
//     console.log(`[Match ${matchId}] -> Phase: ${phase} | Round: ${round}`);

//     // ----------------- Role Assignment -----------------
//     if (phase === "cooldown" || phase === "selection") {
//       const isFirstSelection = round === 0;
//       await roleAssigner(matchRef, round, isFirstSelection);

//       if (!matchData.maxSynergy) {
//         const { player1, player2 } = matchData;
//         const maxSynergy = Math.max(
//           player1.initialSynergy || player1.synergy || 0,
//           player2.initialSynergy || player2.synergy || 0
//         );
//         await matchRef.update({ maxSynergy });
//         console.log(
//           `[Match ${matchRef.key}] -> maxSynergy set to ${maxSynergy}`
//         );
//       }
//     }

//     // ----------------- Battle Phase -----------------
//     if (phase === "battle") {
//       console.log(`[Match ${matchId}] -> Battle started for Round ${round}`);
//       const battleResult = await executeBattlePhase(matchId);
//       activeTimers[matchId] = setTimeout(async () => {
//         await saveRoundData(matchId, round);

//         // Reset player end flags only after battle finishes
//         await matchRef.update({ player1End: false, player2End: false });

//         console.log(`[Match ${matchId}] -> Round ${round} saved`);

//         // Increment round for next selection
//         const nextRound = round + 1;

//         // Proceed to next selection/battle
//         nextPhase(currentIndex + 1, nextRound);

//         delete activeTimers[matchId];
//       }, timer);

//       return; // don't schedule nextPhase yet, battle handles it
//     }

//     // ----------------- Finished Phase -----------------
//     if (phase === "finished") {
//       const { player1, player2 } = matchData;
//       const winnerId =
//         player1.synergy > player2.synergy
//           ? player1.userId
//           : player2.synergy > player1.synergy
//           ? player2.userId
//           : false;
//       const loserId =
//         winnerId === player1.userId
//           ? player2.userId
//           : winnerId === player2.userId
//           ? player1.userId
//           : false;

//       await matchRef.update({ winnerId, loserId });
//       console.log(
//         `[Match ${matchId}] -> Winner: ${winnerId || "Draw"} | Loser: ${
//           loserId || "None"
//         }`
//       );

//       activeTimers[matchId] = setTimeout(async () => {
//         await matchRef.remove();
//         console.log(`[Match ${matchId}] -> Deleted from ongoingBattles`);
//         delete activeTimers[matchId];
//       }, timer);
//       return;
//     }

//     // ----------------- Schedule Next Phase -----------------
//     activeTimers[matchId] = setTimeout(() => {
//       nextPhase(currentIndex + 1, round);
//       delete activeTimers[matchId];
//     }, timer);
//   }

//   nextPhase(startIndex, startRound);
// }

// module.exports = {
//   startPhaseLoop,
//   endRound,
// };

// const { db } = require("./firebase");
// const { saveRoundData } = require("./controllers/battleController");
// const { PHASES, PHASE_TIMERS } = require("./weights/phaseConstants");
// const executeBattlePhase = require("./battleLogics");

// const activeTimers = {};

// // ----------------- Role Assigner -----------------
// async function roleAssigner(matchRef, round, isFirstRound = false) {
//   const snap = await matchRef.get();
//   const matchData = snap.val();
//   if (!matchData?.player1 || !matchData?.player2) return;

//   const { player1, player2 } = matchData;
//   let player1Role, player2Role;

//   if (isFirstRound) {
//     player1Role =
//       (player1.synergy || 0) >= (player2.synergy || 0) ? "attack" : "defense";
//     player2Role = player1Role === "attack" ? "defense" : "attack";
//   } else {
//     player1Role = player1.currentRole === "attack" ? "defense" : "attack";
//     player2Role = player2.currentRole === "attack" ? "defense" : "attack";
//   }

//   await matchRef.update({
//     "player1/currentRole": player1Role,
//     "player2/currentRole": player2Role,
//   });

//   console.log(
//     `[Match ${matchRef.key}] -> Roles assigned | Round ${round}: Player1=${player1Role}, Player2=${player2Role}`
//   );
// }

// // ----------------- End Round -----------------
// async function endRound(matchId, playerId) {
//   const matchRef = db.ref(`ongoingBattles/${matchId}`);
//   const snap = await matchRef.get();
//   const matchData = snap.val();
//   if (!matchData) throw new Error("Match not found");

//   const updateObj = {};
//   if (matchData.player1.userId === playerId) updateObj.player1End = true;
//   else if (matchData.player2.userId === playerId) updateObj.player2End = true;
//   else throw new Error("Invalid playerId");

//   await matchRef.update(updateObj);

//   // If both players ended during selection, skip remaining selection timer
//   const updatedSnap = await matchRef.get();
//   const updatedData = updatedSnap.val();
//   if (
//     updatedData.player1End &&
//     updatedData.player2End &&
//     updatedData.currentPhase === "selection"
//   ) {
//     console.log(`[Match ${matchId}] -> Both players ended, skipping to battle`);

//     // Clear existing timer
//     if (activeTimers[matchId]) {
//       clearTimeout(activeTimers[matchId]);
//       delete activeTimers[matchId];
//     }

//     // Start battle immediately
//     await startPhaseLoop(
//       matchId,
//       PHASES.indexOf("battle"),
//       updatedData.round || 0
//     );
//   }
// }

// // ----------------- Phase Loop -----------------
// async function startPhaseLoop(matchId, startIndex = 0, startRound = 0) {
//   const matchRef = db.ref(`ongoingBattles/${matchId}`);

//   async function nextPhase(currentIndex = startIndex, round = startRound) {
//     if (currentIndex >= PHASES.length) return;

//     const snap = await matchRef.get();
//     const matchData = snap.val();
//     if (!matchData) return;
//     if (matchData.currentPhase === "cancelled") return;

//     let phase = PHASES[currentIndex];
//     let timer = PHASE_TIMERS[phase];

//     // ----------------- Skip selection -> battle -----------------
//     if (phase === "selection") {
//       if (matchData.player1End && matchData.player2End) {
//         phase = "battle";
//         timer = 0;
//         await matchRef.update({ player1End: false, player2End: false });
//       }
//     }

//     await matchRef.update({
//       currentPhase: phase,
//       phaseStartTime: Date.now(),
//       round,
//     });
//     console.log(`[Match ${matchId}] -> Phase: ${phase} | Round: ${round}`);

//     // ----------------- Role Assignment -----------------
//     if (phase === "cooldown" || phase === "selection") {
//       const isFirstSelection = round === 0;
//       await roleAssigner(matchRef, round, isFirstSelection);

//       if (!matchData.maxSynergy) {
//         const { player1, player2 } = matchData;
//         const maxSynergy = Math.max(
//           player1.initialSynergy || player1.synergy || 0,
//           player2.initialSynergy || player2.synergy || 0
//         );
//         await matchRef.update({ maxSynergy });
//         console.log(
//           `[Match ${matchRef.key}] -> maxSynergy set to ${maxSynergy}`
//         );
//       }
//     }

//     // ----------------- Battle Phase -----------------
//     if (phase === "battle") {
//       console.log(`[Match ${matchId}] -> Battle started for Round ${round}`);
//       const battleResult = await executeBattlePhase(matchId);
//       activeTimers[matchId] = setTimeout(async () => {
//         await saveRoundData(matchId, round);

//         // Reset player end flags only after battle finishes
//         await matchRef.update({ player1End: false, player2End: false });

//         console.log(`[Match ${matchId}] -> Round ${round} saved`);

//         // Increment round for next selection
//         const nextRound = round + 1;

//         // Proceed to next selection/battle
//         nextPhase(currentIndex + 1, nextRound);

//         delete activeTimers[matchId];
//       }, timer);

//       return; // don't schedule nextPhase yet, battle handles it
//     }

//     // ----------------- Finished Phase -----------------
//     if (phase === "finished") {
//       const { player1, player2 } = matchData;
//       const winnerId =
//         player1.synergy > player2.synergy
//           ? player1.userId
//           : player2.synergy > player1.synergy
//           ? player2.userId
//           : false;
//       const loserId =
//         winnerId === player1.userId
//           ? player2.userId
//           : winnerId === player2.userId
//           ? player1.userId
//           : false;

//       await matchRef.update({ winnerId, loserId });
//       console.log(
//         `[Match ${matchId}] -> Winner: ${winnerId || "Draw"} | Loser: ${
//           loserId || "None"
//         }`
//       );

//       activeTimers[matchId] = setTimeout(async () => {
//         await matchRef.remove();
//         console.log(`[Match ${matchId}] -> Deleted from ongoingBattles`);
//         delete activeTimers[matchId];
//       }, timer);
//       return;
//     }

//     // ----------------- Schedule Next Phase -----------------
//     activeTimers[matchId] = setTimeout(() => {
//       nextPhase(currentIndex + 1, round);
//       delete activeTimers[matchId];
//     }, timer);
//   }

//   nextPhase(startIndex, startRound);
// }

// module.exports = {
//   startPhaseLoop,
//   endRound,
// };
